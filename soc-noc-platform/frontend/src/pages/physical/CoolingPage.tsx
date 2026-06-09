import React from "react";
import { useQuery } from "@tanstack/react-query";
import { devices as devicesApi, metrics as metricsApi, alerts as alertsApi } from "../../services/api";
import { StatusDot } from "../../components/common/StatusDot";
import { AlertSeverityBadge } from "../../components/common/AlertSeverityBadge";

function TempBar({ value, label, warn = 28, critical = 35 }: {
  value: number | null; label: string; warn?: number; critical?: number;
}) {
  const max = 50;
  const pct = value !== null ? Math.min((value / max) * 100, 100) : 0;
  const color = value === null ? "bg-gray-300"
    : value >= critical ? "bg-red-500"
    : value >= warn ? "bg-orange-400"
    : "bg-green-500";

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={`font-bold ${value === null ? "text-gray-400" : value >= critical ? "text-red-600" : value >= warn ? "text-orange-600" : "text-green-600"}`}>
          {value !== null ? `${value.toFixed(1)}°C` : "—"}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0°C</span>
        <span className="text-orange-400">⚠ {warn}°C</span>
        <span className="text-red-400">🔴 {critical}°C</span>
        <span>{max}°C</span>
      </div>
    </div>
  );
}

export function CoolingPage() {
  const { data: cracDevices } = useQuery({
    queryKey: ["devices", { type: "crac" }],
    queryFn: () => devicesApi.list({ device_type: "crac", size: 30 }),
    refetchInterval: 30_000,
  });

  const { data: crahDevices } = useQuery({
    queryKey: ["devices", { type: "crah" }],
    queryFn: () => devicesApi.list({ device_type: "crah", size: 30 }),
    refetchInterval: 30_000,
  });

  const { data: chillerDevices } = useQuery({
    queryKey: ["devices", { type: "chiller" }],
    queryFn: () => devicesApi.list({ device_type: "chiller", size: 20 }),
    refetchInterval: 30_000,
  });

  const { data: tempAlerts } = useQuery({
    queryKey: ["alerts", { category: "temperature", status: "active" }],
    queryFn: () => alertsApi.list({ category: "temperature", status: "active", size: 10 }),
    refetchInterval: 15_000,
  });

  const { data: coolingAlerts } = useQuery({
    queryKey: ["alerts", { category: "cooling", status: "active" }],
    queryFn: () => alertsApi.list({ category: "cooling", status: "active", size: 10 }),
    refetchInterval: 15_000,
  });

  const totalAlerts = (tempAlerts?.total || 0) + (coolingAlerts?.total || 0);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">❄️ Supervision Climatisation</h1>
        {totalAlerts > 0 && (
          <span className="bg-orange-100 text-orange-700 text-sm font-medium px-3 py-1 rounded-full">
            {totalAlerts} alerte(s) thermique(s)
          </span>
        )}
      </div>

      {/* Alertes thermiques */}
      {totalAlerts > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 className="font-semibold text-orange-800 mb-3">Alertes thermiques actives</h3>
          <div className="space-y-2">
            {[...(tempAlerts?.items || []), ...(coolingAlerts?.items || [])].map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-orange-100">
                <AlertSeverityBadge severity={alert.severity} />
                <div>
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <div className="text-sm text-gray-500">{alert.message}</div>
                </div>
                {alert.metric_value !== undefined && (
                  <span className="ml-auto text-lg font-bold text-red-600">
                    {alert.metric_value}°C
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CRAC */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          CRAC (Computer Room Air Conditioning) — {cracDevices?.total || 0}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(cracDevices?.items || []).map((device) => (
            <CRACCard key={device.id} device={device} />
          ))}
          {!cracDevices?.items.length && (
            <div className="col-span-2 text-center text-gray-400 py-8">Aucun CRAC configuré</div>
          )}
        </div>
      </section>

      {/* CRAH */}
      {(crahDevices?.items || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            CRAH (Computer Room Air Handler) — {crahDevices?.total || 0}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(crahDevices?.items || []).map((device) => (
              <CRACCard key={device.id} device={device} />
            ))}
          </div>
        </section>
      )}

      {/* Chillers */}
      {(chillerDevices?.items || []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Refroidisseurs (Chillers) — {chillerDevices?.total || 0}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(chillerDevices?.items || []).map((device) => (
              <ChillerCard key={device.id} device={device} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CRACCard({ device }: { device: any }) {
  const { data: metrics } = useQuery({
    queryKey: ["metrics", "current", device.id, "crac"],
    queryFn: async () => {
      const [returnTemp, supplyTemp, humidity, fanSpeed, power] = await Promise.all([
        metricsApi.current(device.id, "return_air_temp").then(r => r.value),
        metricsApi.current(device.id, "supply_air_temp").then(r => r.value),
        metricsApi.current(device.id, "return_humidity").then(r => r.value),
        metricsApi.current(device.id, "fan_speed").then(r => r.value),
        metricsApi.current(device.id, "power_consumption").then(r => r.value),
      ]);
      return { returnTemp, supplyTemp, humidity, fanSpeed, power };
    },
    refetchInterval: 30_000,
    enabled: !!device.id,
  });

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-gray-900">{device.name}</div>
          <div className="text-xs text-gray-400">{device.ip_address} — {device.room || "Salle non renseignée"}</div>
          <div className="text-xs text-gray-400">{device.vendor} {device.model}</div>
        </div>
        <StatusDot status={device.status} size="lg" />
      </div>

      <div className="space-y-3">
        <TempBar value={metrics?.returnTemp ?? null} label="Température retour (chaude)" warn={28} critical={35} />
        <TempBar value={metrics?.supplyTemp ?? null} label="Température soufflage (froide)" warn={20} critical={25} />

        <div className="grid grid-cols-3 gap-3 text-xs text-gray-600 pt-2">
          <div className="text-center">
            <div className="text-gray-400">Humidité</div>
            <div className="font-bold text-gray-800 text-base">
              {metrics?.humidity !== null ? `${Math.round(metrics?.humidity || 0)}%` : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Ventilateur</div>
            <div className="font-bold text-gray-800 text-base">
              {metrics?.fanSpeed !== null ? `${Math.round(metrics?.fanSpeed || 0)}%` : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-400">Puissance</div>
            <div className="font-bold text-gray-800 text-base">
              {metrics?.power !== null ? `${metrics?.power}kW` : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChillerCard({ device }: { device: any }) {
  const { data: metrics } = useQuery({
    queryKey: ["metrics", "current", device.id, "chiller"],
    queryFn: async () => {
      const [supplyTemp, returnTemp, capacity, power] = await Promise.all([
        metricsApi.current(device.id, "chilled_water_supply_temp").then(r => r.value),
        metricsApi.current(device.id, "chilled_water_return_temp").then(r => r.value),
        metricsApi.current(device.id, "chiller_capacity").then(r => r.value),
        metricsApi.current(device.id, "power_consumption").then(r => r.value),
      ]);
      return { supplyTemp, returnTemp, capacity, power };
    },
    refetchInterval: 30_000,
    enabled: !!device.id,
  });

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-medium text-gray-900">{device.name}</div>
          <div className="text-xs text-gray-400">{device.ip_address}</div>
        </div>
        <StatusDot status={device.status} size="lg" />
      </div>
      <div className="space-y-1.5 text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Eau glacée départ</span>
          <strong className="text-blue-600">{metrics?.supplyTemp !== null ? `${metrics?.supplyTemp}°C` : "—"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Eau glacée retour</span>
          <strong>{metrics?.returnTemp !== null ? `${metrics?.returnTemp}°C` : "—"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Capacité</span>
          <strong>{metrics?.capacity !== null ? `${Math.round(metrics?.capacity || 0)}%` : "—"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Puissance</span>
          <strong>{metrics?.power !== null ? `${metrics?.power}kW` : "—"}</strong>
        </div>
      </div>
    </div>
  );
}
