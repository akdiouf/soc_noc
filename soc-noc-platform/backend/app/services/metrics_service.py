"""
Metrics Service — écriture/lecture des métriques dans InfluxDB
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from influxdb_client import Point, WritePrecision
from influxdb_client.client.write_api import ASYNCHRONOUS
from app.core.database import get_influxdb
from app.core.config import settings

logger = logging.getLogger(__name__)


class MetricsService:

    async def write_device_metrics(
        self,
        device_id: str,
        device_name: str,
        device_type: str,
        site: str,
        metrics: dict,
        measurement: str = "device_metrics",
    ):
        async with get_influxdb() as client:
            write_api = client.write_api()
            points = []

            for metric_name, value in metrics.items():
                if value is None or isinstance(value, str):
                    continue
                try:
                    point = (
                        Point(measurement)
                        .tag("device_id", device_id)
                        .tag("device_name", device_name)
                        .tag("device_type", device_type)
                        .tag("site", site)
                        .field(metric_name, float(value))
                        .time(datetime.utcnow(), WritePrecision.SECONDS)
                    )
                    points.append(point)
                except (TypeError, ValueError):
                    pass

            if points:
                await write_api.write(
                    bucket=settings.INFLUXDB_BUCKET,
                    org=settings.INFLUXDB_ORG,
                    record=points,
                )

    async def write_interface_metrics(
        self,
        device_id: str,
        device_name: str,
        site: str,
        interface_index: str,
        interface_name: str,
        metrics: dict,
    ):
        async with get_influxdb() as client:
            write_api = client.write_api()
            points = []

            for metric_name, value in metrics.items():
                if value is None or isinstance(value, str) or metric_name.endswith("_unit"):
                    continue
                try:
                    point = (
                        Point("interface_metrics")
                        .tag("device_id", device_id)
                        .tag("device_name", device_name)
                        .tag("site", site)
                        .tag("if_index", interface_index)
                        .tag("if_name", interface_name)
                        .field(metric_name, float(value))
                        .time(datetime.utcnow(), WritePrecision.SECONDS)
                    )
                    points.append(point)
                except (TypeError, ValueError):
                    pass

            if points:
                await write_api.write(
                    bucket=settings.INFLUXDB_BUCKET,
                    org=settings.INFLUXDB_ORG,
                    record=points,
                )

    async def write_ups_metrics(self, device_id: str, device_name: str, site: str, metrics: dict):
        await self.write_device_metrics(device_id, device_name, "ups", site, metrics, "ups_metrics")

    async def write_environmental_metrics(
        self,
        device_id: str,
        device_name: str,
        site: str,
        room: str,
        metrics: dict,
    ):
        async with get_influxdb() as client:
            write_api = client.write_api()
            points = []

            for metric_name, value in metrics.items():
                if value is None or isinstance(value, str):
                    continue
                try:
                    point = (
                        Point("environmental")
                        .tag("device_id", device_id)
                        .tag("device_name", device_name)
                        .tag("site", site)
                        .tag("room", room)
                        .field(metric_name, float(value))
                        .time(datetime.utcnow(), WritePrecision.SECONDS)
                    )
                    points.append(point)
                except (TypeError, ValueError):
                    pass

            if points:
                await write_api.write(
                    bucket=settings.INFLUXDB_BUCKET,
                    org=settings.INFLUXDB_ORG,
                    record=points,
                )

    async def query_device_metrics(
        self,
        device_id: str,
        metric_name: str,
        duration_hours: int = 24,
        aggregation: str = "mean",
        window: str = "5m",
    ) -> list[dict]:
        async with get_influxdb() as client:
            query_api = client.query_api()
            flux = f"""
                from(bucket: "{settings.INFLUXDB_BUCKET}")
                  |> range(start: -{duration_hours}h)
                  |> filter(fn: (r) => r._measurement == "device_metrics")
                  |> filter(fn: (r) => r.device_id == "{device_id}")
                  |> filter(fn: (r) => r._field == "{metric_name}")
                  |> aggregateWindow(every: {window}, fn: {aggregation}, createEmpty: false)
                  |> yield(name: "{aggregation}")
            """
            try:
                tables = await query_api.query(flux, org=settings.INFLUXDB_ORG)
                results = []
                for table in tables:
                    for record in table.records:
                        results.append({
                            "timestamp": record.get_time().isoformat(),
                            "value": record.get_value(),
                            "field": record.get_field(),
                        })
                return results
            except Exception as e:
                logger.error(f"InfluxDB query error: {e}")
                return []

    async def get_current_value(self, device_id: str, metric_name: str) -> Optional[float]:
        async with get_influxdb() as client:
            query_api = client.query_api()
            flux = f"""
                from(bucket: "{settings.INFLUXDB_BUCKET}")
                  |> range(start: -5m)
                  |> filter(fn: (r) => r._measurement == "device_metrics")
                  |> filter(fn: (r) => r.device_id == "{device_id}")
                  |> filter(fn: (r) => r._field == "{metric_name}")
                  |> last()
            """
            try:
                tables = await query_api.query(flux, org=settings.INFLUXDB_ORG)
                for table in tables:
                    for record in table.records:
                        return record.get_value()
            except Exception as e:
                logger.error(f"InfluxDB last value query error: {e}")
            return None

    async def get_stats(
        self,
        device_id: str,
        metric_name: str,
        duration_hours: int = 24,
    ) -> dict:
        async with get_influxdb() as client:
            query_api = client.query_api()
            flux = f"""
                data = from(bucket: "{settings.INFLUXDB_BUCKET}")
                  |> range(start: -{duration_hours}h)
                  |> filter(fn: (r) => r._measurement == "device_metrics")
                  |> filter(fn: (r) => r.device_id == "{device_id}")
                  |> filter(fn: (r) => r._field == "{metric_name}")

                union(tables: [
                  data |> mean() |> set(key: "_stat", value: "mean"),
                  data |> min() |> set(key: "_stat", value: "min"),
                  data |> max() |> set(key: "_stat", value: "max"),
                ])
            """
            try:
                tables = await query_api.query(flux, org=settings.INFLUXDB_ORG)
                stats = {}
                for table in tables:
                    for record in table.records:
                        stat = record.values.get("_stat")
                        if stat:
                            stats[stat] = record.get_value()
                return stats
            except Exception as e:
                logger.error(f"InfluxDB stats query error: {e}")
                return {}
