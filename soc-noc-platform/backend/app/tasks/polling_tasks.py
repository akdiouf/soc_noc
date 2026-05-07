"""
Tâches Celery de polling périodique des équipements
"""
import asyncio
import logging
import socket
from celery import shared_task
from sqlalchemy import select, and_
from app.models.device import Device, DeviceType, MonitoringProtocol, DeviceStatus
from app.collectors.snmp_collector import SNMPCollector, SNMPConfig
from app.collectors.modbus_collector import ModbusCollector, ModbusConfig
from app.collectors.bacnet_collector import BACnetCollector, BACnetConfig
from app.services.metrics_service import MetricsService
from app.services.alert_service import AlertService
from app.models.alert import AlertSeverity, AlertCategory
from app.core.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def poll_all_snmp_devices(self):
    return run_async(_poll_all_snmp_devices())


async def _poll_all_snmp_devices():
    async with AsyncSessionLocal() as db:
        stmt = select(Device).where(
            and_(
                Device.is_monitored == True,
                Device.monitoring_protocol.in_([
                    MonitoringProtocol.SNMP_V1,
                    MonitoringProtocol.SNMP_V2C,
                    MonitoringProtocol.SNMP_V3,
                ]),
                Device.status != DeviceStatus.MAINTENANCE,
            )
        )
        result = await db.execute(stmt)
        devices = result.scalars().all()

        tasks = [_poll_snmp_device(device, db) for device in devices]
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"SNMP polling completed for {len(devices)} devices")


async def _poll_snmp_device(device: Device, db):
    metrics_svc = MetricsService()
    alert_svc = AlertService(db)

    version_map = {
        MonitoringProtocol.SNMP_V1: "v1",
        MonitoringProtocol.SNMP_V2C: "v2c",
        MonitoringProtocol.SNMP_V3: "v3",
    }

    config = SNMPConfig(
        ip=device.ip_address,
        version=version_map.get(device.monitoring_protocol, "v2c"),
        community=device.snmp_community or settings.SNMP_COMMUNITY,
        username=device.snmp_username or "",
        auth_protocol=device.snmp_auth_protocol or "SHA",
        auth_password=device.snmp_auth_password or "",
        priv_protocol=device.snmp_priv_protocol or "AES",
        priv_password=device.snmp_priv_password or "",
    )

    collector = SNMPCollector(config)

    try:
        # Infos système
        sys_info = await collector.collect_system_info()
        metrics = {"sysuptime": sys_info.get("sysuptime")}

        # Interfaces
        if device.device_type in (DeviceType.ROUTER, DeviceType.SWITCH, DeviceType.FIREWALL):
            interfaces = await collector.collect_interfaces()
            for iface in interfaces:
                if iface.get("in_octets") or iface.get("out_octets"):
                    await metrics_svc.write_interface_metrics(
                        device_id=str(device.id),
                        device_name=device.name,
                        site=device.site.value,
                        interface_index=iface["index"],
                        interface_name=iface["description"],
                        metrics=iface,
                    )
                # Alerte si interface down
                if iface.get("oper_status") == "2":  # down
                    await alert_svc.create_or_update(
                        title=f"{device.name} — Interface {iface['description']} DOWN",
                        message=f"L'interface {iface['description']} est hors service",
                        severity=AlertSeverity.CRITICAL if device.is_critical else AlertSeverity.WARNING,
                        category=AlertCategory.AVAILABILITY,
                        device_id=device.id,
                        source_name=device.name,
                        metric_name="interface_status",
                        raw_data=iface,
                    )

        # UPS via SNMP (Eaton, APC via RFC 1628)
        if device.device_type == DeviceType.UPS:
            ups_metrics = await collector.collect_ups_metrics()
            metrics.update(ups_metrics)

            # Alerte batterie faible
            charge = ups_metrics.get("battery_charge_percent")
            if charge is not None:
                await alert_svc.check_threshold(device, "battery_charge", charge, "%")

        # Métriques environnementales APC
        if device.device_type in (DeviceType.UPS, DeviceType.CRAC):
            env = await collector.collect_apc_environment()
            for sensor in env.get("sensors", []):
                if sensor.get("temperature_celsius"):
                    await alert_svc.check_threshold(
                        device, "temperature", sensor["temperature_celsius"], "°C"
                    )

        await metrics_svc.write_device_metrics(
            device_id=str(device.id),
            device_name=device.name,
            device_type=device.device_type.value,
            site=device.site.value,
            metrics=metrics,
        )

        # Mettre à jour le statut
        device.status = DeviceStatus.UP
        device.last_poll = __import__("datetime").datetime.utcnow()
        await db.flush()

    except Exception as e:
        logger.error(f"SNMP poll error for {device.name} ({device.ip_address}): {e}")
        device.status = DeviceStatus.UNKNOWN
        await db.flush()


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def poll_all_modbus_devices(self):
    return run_async(_poll_all_modbus_devices())


async def _poll_all_modbus_devices():
    async with AsyncSessionLocal() as db:
        stmt = select(Device).where(
            and_(
                Device.is_monitored == True,
                Device.monitoring_protocol.in_([
                    MonitoringProtocol.MODBUS_TCP,
                    MonitoringProtocol.MODBUS_RTU,
                ]),
                Device.status != DeviceStatus.MAINTENANCE,
            )
        )
        result = await db.execute(stmt)
        devices = result.scalars().all()

        for device in devices:
            await _poll_modbus_device(device, db)

        logger.info(f"Modbus polling completed for {len(devices)} devices")


async def _poll_modbus_device(device: Device, db):
    metrics_svc = MetricsService()
    alert_svc = AlertService(db)

    config = ModbusConfig(
        ip=device.ip_address,
        port=device.modbus_port or 502,
        unit_id=device.modbus_unit_id or 1,
    )
    collector = ModbusCollector(config)

    try:
        metrics = {}
        if device.device_type == DeviceType.UPS:
            metrics = await collector.collect_ups()
            charge = metrics.get("battery_charge")
            if charge is not None:
                await alert_svc.check_threshold(device, "battery_charge", charge, "%")
            load = metrics.get("output_load")
            if load is not None and load > 90:
                await alert_svc.create_or_update(
                    title=f"{device.name} — Charge UPS critique: {load}%",
                    message=f"La charge de sortie UPS est à {load}% (seuil critique: 90%)",
                    severity=AlertSeverity.CRITICAL,
                    category=AlertCategory.POWER,
                    device_id=device.id,
                    source_name=device.name,
                    metric_name="output_load",
                    metric_value=load,
                    metric_unit="%",
                )

        elif device.device_type == DeviceType.GENERATOR:
            metrics = await collector.collect_generator()
            fuel = metrics.get("fuel_level")
            if fuel is not None and fuel < 30:
                await alert_svc.create_or_update(
                    title=f"{device.name} — Niveau carburant faible: {fuel}%",
                    message=f"Le groupe électrogène {device.name} a un niveau de carburant de {fuel}%",
                    severity=AlertSeverity.WARNING if fuel > 15 else AlertSeverity.CRITICAL,
                    category=AlertCategory.POWER,
                    device_id=device.id,
                    source_name=device.name,
                    metric_name="fuel_level",
                    metric_value=fuel,
                    metric_unit="%",
                )

        elif device.device_type in (DeviceType.CRAC, DeviceType.CRAH):
            metrics = await collector.collect_crac()
            temp = metrics.get("return_air_temp")
            if temp is not None:
                await alert_svc.check_threshold(device, "temperature", temp, "°C")

        elif device.device_type == DeviceType.PDU:
            metrics = await collector.collect_pdu()

        if metrics:
            await metrics_svc.write_device_metrics(
                device_id=str(device.id),
                device_name=device.name,
                device_type=device.device_type.value,
                site=device.site.value,
                metrics=metrics,
            )
            device.status = DeviceStatus.UP
        else:
            device.status = DeviceStatus.UNKNOWN

        device.last_poll = __import__("datetime").datetime.utcnow()
        await db.flush()

    except Exception as e:
        logger.error(f"Modbus poll error for {device.name}: {e}")
        device.status = DeviceStatus.UNKNOWN
        await db.flush()


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def poll_all_bacnet_devices(self):
    return run_async(_poll_all_bacnet_devices())


async def _poll_all_bacnet_devices():
    async with AsyncSessionLocal() as db:
        stmt = select(Device).where(
            and_(
                Device.is_monitored == True,
                Device.monitoring_protocol == MonitoringProtocol.BACNET_IP,
                Device.status != DeviceStatus.MAINTENANCE,
            )
        )
        result = await db.execute(stmt)
        devices = result.scalars().all()

        metrics_svc = MetricsService()
        alert_svc = AlertService(db)

        for device in devices:
            config = BACnetConfig(
                ip=device.ip_address,
                device_id=device.bacnet_device_id or 1,
            )
            collector = BACnetCollector(config)
            try:
                if device.device_type in (DeviceType.CRAC, DeviceType.CRAH):
                    metrics = await collector.collect_hvac()
                elif device.device_type == DeviceType.CHILLER:
                    metrics = await collector.collect_chiller()
                else:
                    continue

                await metrics_svc.write_environmental_metrics(
                    device_id=str(device.id),
                    device_name=device.name,
                    site=device.site.value,
                    room=device.room or "unknown",
                    metrics=metrics,
                )

                temp = metrics.get("return_air_temp")
                if temp is not None:
                    await alert_svc.check_threshold(device, "temperature", temp, "°C")

                device.status = DeviceStatus.UP
                device.last_poll = __import__("datetime").datetime.utcnow()
                await db.flush()
            except Exception as e:
                logger.error(f"BACnet poll error for {device.name}: {e}")
            finally:
                await collector.close()


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def check_all_devices_reachability(self):
    return run_async(_check_all_devices_reachability())


async def _check_all_devices_reachability():
    async with AsyncSessionLocal() as db:
        stmt = select(Device).where(
            and_(
                Device.is_monitored == True,
                Device.status != DeviceStatus.MAINTENANCE,
            )
        )
        result = await db.execute(stmt)
        devices = result.scalars().all()

        alert_svc = AlertService(db)
        tasks = [_ping_device(device, alert_svc, db) for device in devices]
        await asyncio.gather(*tasks, return_exceptions=True)


async def _ping_device(device: Device, alert_svc: AlertService, db):
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None,
            lambda: socket.setdefaulttimeout(3) or socket.create_connection(
                (device.ip_address, 80), timeout=3
            ).close()
        )
        reachable = True
    except (socket.timeout, ConnectionRefusedError, OSError):
        # Essayer ping ICMP via proc
        try:
            import subprocess
            result = await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    ["ping", "-c", "1", "-W", "2", device.ip_address],
                    capture_output=True, timeout=5
                )
            )
            reachable = result.returncode == 0
        except Exception:
            reachable = False

    if not reachable:
        await alert_svc.create_or_update(
            title=f"{device.name} — Équipement inaccessible",
            message=f"L'équipement {device.name} ({device.ip_address}) ne répond pas",
            severity=AlertSeverity.CRITICAL if device.is_critical else AlertSeverity.WARNING,
            category=AlertCategory.AVAILABILITY,
            device_id=device.id,
            source_ip=device.ip_address,
            source_name=device.name,
            metric_name="reachability",
        )
        if device.status != DeviceStatus.DOWN:
            device.status = DeviceStatus.DOWN
            await db.flush()
    else:
        if device.status == DeviceStatus.DOWN:
            await alert_svc.auto_resolve(device.id, "reachability", AlertCategory.AVAILABILITY)
