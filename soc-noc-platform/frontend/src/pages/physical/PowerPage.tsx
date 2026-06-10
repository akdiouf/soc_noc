import React from "react";
import { useQuery } from "@tanstack/react-query";
import { devices as devicesApi, metrics as metricsApi } from "../../services/api";
import { StatusDot } from "../../components/common/StatusDot";
import { AlertSeverityBadge } from "../../components/common/AlertSeverityBadge";
import { alerts as alertsApi } from "../../services/api";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

function BatteryGauge({ value, label }: { value: number; label: string }) {
  const color = value > 50 ? "#10b981" : value > 20 ? "#f59e0b" : "#ef4444";
  const data = [{ value, fill: color }];
  return (
    <div className="text-center">
      <ResponsiveContainer width={120} height={120}>
        <RadialBarChart
          cx="50%" cy="50%"
          innerRadius="60%" outerRadius="80%"
          barSize={12}
          data={data}
          startAngle={180} endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={6} />
          <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
            className="text-2xl font-bold" fill={color} fontSize={22}>
            {value}%
          </text>
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export function PowerPage() {
  const { data: upsDevices } = useQuery({
    queryKey: ["devices", { type: "ups" }],
    queryFn: () => devicesApi.list({ device_type: "ups", size: 50 }),
    refetchInterval: 30_000,
  });

  const { data: pduDevices } = useQuery({
    queryKey: ["devices", { type: "pdu" }],
    queryFn: () => devicesApi.list({ device_type: "pdu", size: 50 }),
    refetchInterval: 30_000,
  });

  const { data: generatorDevices } = useQuery({
    queryKey: ["devices", { type: "generator" }],
    queryFn: () => devicesApi.list({ device_type: "generator", size: 20 }),
    refetchInterval: 30_000,
  });

  const { data: powerAlerts } = useQuery({
    queryKey: ["alerts", { category: "power", status: "active" }],
    queryFn: () => alertsApi.list({ category: "power", status: "active", size: 20 }),
    refetchInterval: 15_000,
  });

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">⚡ Supervision Alimentation</h1>
        {(powerAlerts?.total || 0) > 0 && (
          <span className="bg-red-100 text-red-700 text-sm font-medium px-3 py-1 rounded-full">
            {powerAlerts?.total} alerte(s) active(s)
          </span>
        )}
      </div>

      {/* Alertes alimentation actives */}
      {(powerAlerts?.items || []).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-800 mb-3">Alertes alimentation actives</h3>
          <div className="space-y-2">
            {powerAlerts!.items.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-red-100">
                <AlertSeverityBadge severity={alert.severity} />
                <div>
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <div className="text-sm text-gray-500">{alert.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UPS */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          🔋 Onduleurs (UPS) — {upsDevices?.total || 0} équipement(s)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(upsDevices?.items || []).map((device) => (
            <UPSCard key={device.id} device={device} />
          ))}
          {!upsDevices?.items.length && (
            <div className="col-span-3 text-center text-gray-400 py-8">Aucun UPS configuré</div>
          )}
        </div>
      </section>

      {/* Groupes électrogènes */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          ⚡ Groupes électrogènes — {generatorDevices?.total || 0} équipement(s)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(generatorDevices?.items || []).map((device) => (
            <GeneratorCard key={device.id} device={device} />
          ))}
          {!generatorDevices?.items.length && (
            <div className="col-span-3 text-center text-gray-400 py-8">Aucun groupe électrogène configuré</div>
          )}
        </div>
      </section>

      {/* PDU */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          🔌 PDU (Power Distribution Units) — {pduDevices?.total || 0} équipement(s)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(pduDevices?.items || []).map((device) => (
            <PDUCard key={device.id} device={device} />
          ))}
          {!pduDevices?.items.length && (
            <div className="col-span-4 text-center text-gray-400 py-8">Aucun PDU configuré</div>
          )}
        </div>
      </section>
    </div>
  );
}

function UPSCard({ device }: { device: any }) {
  const { data: metrics } = useQuery({
    queryKey: ["metrics", "current", device.id, "ups"],
    queryFn: async () => {
      const [charge, load, temp, runtime] = await Promise.all([
        metricsApi.current(device.id, "battery_charge").then(r => r.value),
        metricsApi.current(device.id, "output_load").then(r => r.value),
        metricsApi.current(device.id, "battery_temp").then(r => r.value),
        metricsApi.current(device.id, "battery_runtime").then(r => r.value),
      ]);
      return { charge, load, temp, runtime };
    },
    refetchInterval: 30_000,
    enabled: !!device.id,
  });

  const charge = metrics?.charge ?? null;
  const load = metrics?.load ?? null;

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-gray-900">{device.name}</div>
          <div className="text-xs text-gray-400">{device.ip_address}</div>
          {device.vendor && <div className="text-xs text-gray-400">{device.vendor} {device.model}</div>}
        </div>
        <StatusDot status={device.status} size="lg" />
      </div>

      {charge !== null ? (
        <div className="flex justify-around">
          <BatteryGauge value={Math.round(charge)} label="Batterie" />
          <BatteryGauge value={Math.round(load || 0)} label="Charge" />
        </div>
      ) : (
        <div className="text-center text-gray-400 py-4 text-sm">Données non disponibles</div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>Temp. batterie: <strong>{metrics?.temp !== null ? `${metrics?.temp}°C` : "—"}</strong></div>
        <div>Autonomie: <strong>{metrics?.runtime !== null ? `${Math.round((metrics?.runtime || 0) / 60)}min` : "—"}</strong></div>
        <div className="col-span-2">
          Site: <span className="font-medium text-blue-600">
            {device.site}
          </span>
          {device.rack && <span className="ml-3">Rack: {device.rack}</span>}
        </div>
      </div>
    </div>
  );
}

function GeneratorCard({ device }: { device: any }) {
  const { data: metrics } = useQuery({
    queryKey: ["metrics", "current", device.id, "generator"],
    queryFn: async () => {
      const [fuel, rpm, temp] = await Promise.all([
        metricsApi.current(device.id, "fuel_level").then(r => r.value),
        metricsApi.current(device.id, "engine_speed").then(r => r.value),
        metricsApi.current(device.id, "engine_temp").then(r => r.value),
      ]);
      return { fuel, rpm, temp };
    },
    refetchInterval: 30_000,
    enabled: !!device.id,
  });

  const fuel = metrics?.fuel ?? null;
  const fuelColor = fuel === null ? "bg-gray-200" : fuel > 50 ? "bg-green-500" : fuel > 20 ? "bg-orange-500" : "bg-red-600";

  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-gray-900">{device.name}</div>
          <div className="text-xs text-gray-400">{device.ip_address}</div>
        </div>
        <StatusDot status={device.status} size="lg" />
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Niveau carburant</span>
            <strong>{fuel !== null ? `${Math.round(fuel)}%` : "—"}</strong>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${fuelColor}`}
              style={{ width: `${fuel || 0}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div>Régime: <strong>{metrics?.rpm !== null ? `${Math.round(metrics?.rpm || 0)} RPM` : "—"}</strong></div>
          <div>Temp. moteur: <strong>{metrics?.temp !== null ? `${metrics?.temp}°C` : "—"}</strong></div>
        </div>
      </div>
    </div>
  );
}

function PDUCard({ device }: { device: any }) {
  const { data: metrics } = useQuery({
    queryKey: ["metrics", "current", device.id, "pdu"],
    queryFn: async () => {
      const [current, power, voltage] = await Promise.all([
        metricsApi.current(device.id, "total_current").then(r => r.value),
        metricsApi.current(device.id, "total_power").then(r => r.value),
        metricsApi.current(device.id, "input_voltage").then(r => r.value),
      ]);
      return { current, power, voltage };
    },
    refetchInterval: 30_000,
    enabled: !!device.id,
  });

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-gray-900 text-sm">{device.name}</div>
        <StatusDot status={device.status} />
      </div>
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex justify-between">
          <span>Tension</span>
          <strong>{metrics?.voltage !== null ? `${metrics?.voltage}V` : "—"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Courant</span>
          <strong>{metrics?.current !== null ? `${metrics?.current}A` : "—"}</strong>
        </div>
        <div className="flex justify-between">
          <span>Puissance</span>
          <strong>{metrics?.power !== null ? `${metrics?.power}kW` : "—"}</strong>
        </div>
      </div>
    </div>
  );
}
