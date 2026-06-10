import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { devices as devicesApi, metrics as metricsApi } from "../services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Device } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";

const METRICS = [
  { key: "cpu_percent", label: "CPU (%)", color: "#3b82f6", unit: "%" },
  { key: "memory_percent", label: "Mémoire (%)", color: "#8b5cf6", unit: "%" },
  { key: "disk_percent", label: "Disque (%)", color: "#f59e0b", unit: "%" },
  { key: "temperature", label: "Température (°C)", color: "#ef4444", unit: "°C" },
  { key: "battery_charge", label: "Batterie (%)", color: "#10b981", unit: "%" },
  { key: "output_load", label: "Charge UPS (%)", color: "#f97316", unit: "%" },
];

const DURATION_OPTIONS = [
  { label: "1h", hours: 1, window: "1m" },
  { label: "6h", hours: 6, window: "5m" },
  { label: "24h", hours: 24, window: "15m" },
  { label: "7j", hours: 168, window: "1h" },
  { label: "30j", hours: 720, window: "6h" },
];

export function MetricsPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0]);
  const [duration, setDuration] = useState(DURATION_OPTIONS[2]);
  const [liveValues, setLiveValues] = useState<Record<string, number>>({});

  // Charger la liste des équipements
  const { data: devicesData } = useQuery({
    queryKey: ["devices", { size: 200 }],
    queryFn: () => devicesApi.list({ size: 200 }),
  });

  // Charger les métriques du device sélectionné
  const { data: chartData, isLoading } = useQuery({
    queryKey: ["metrics", selectedDeviceId, selectedMetric.key, duration.hours, duration.window],
    queryFn: () => metricsApi.device(selectedDeviceId, selectedMetric.key, duration.hours, "mean", duration.window),
    enabled: !!selectedDeviceId,
    refetchInterval: 30_000,
  });

  // Statistiques
  const { data: stats } = useQuery({
    queryKey: ["metrics", "stats", selectedDeviceId, selectedMetric.key, duration.hours],
    queryFn: () => metricsApi.stats(selectedDeviceId, selectedMetric.key, duration.hours),
    enabled: !!selectedDeviceId,
    refetchInterval: 60_000,
  });

  // WebSocket pour métriques temps réel du device sélectionné
  useWebSocket(
    selectedDeviceId ? `/ws/metrics/${selectedDeviceId}` : "/ws/alerts",
    {
      onMessage: (msg) => {
        if (msg.type === "metrics" && (msg.data as any).device_id === selectedDeviceId) {
          setLiveValues((msg.data as any).values || {});
        }
      },
    }
  );

  const formattedChart = (chartData || []).map((point) => ({
    time: format(parseISO(point.timestamp), "HH:mm", { locale: fr }),
    value: Math.round(point.value * 10) / 10,
  }));

  const selectedDevice = devicesData?.items.find(d => d.id === selectedDeviceId);
  const liveValue = liveValues[selectedMetric.key];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Métriques & Performances</h1>

      {/* Sélecteurs */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-48">
          <label className="block text-sm font-medium text-gray-700 mb-1">Équipement</label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Sélectionner un équipement...</option>
            {(devicesData?.items || []).map((d: Device) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.ip_address}) — {d.site}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Métrique</label>
          <select
            value={selectedMetric.key}
            onChange={(e) => setSelectedMetric(METRICS.find(m => m.key === e.target.value) || METRICS[0])}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Période</label>
          <div className="flex border rounded-lg overflow-hidden">
            {DURATION_OPTIONS.map(d => (
              <button
                key={d.label}
                onClick={() => setDuration(d)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  duration.label === d.label
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedDeviceId ? (
        <>
          {/* Valeur actuelle + stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="text-sm text-gray-500">Valeur actuelle</div>
              <div className="text-4xl font-bold mt-1" style={{ color: selectedMetric.color }}>
                {liveValue !== undefined ? `${liveValue}${selectedMetric.unit}` : "—"}
              </div>
              <div className="text-xs text-gray-400 mt-1">Temps réel</div>
            </div>
            {[
              { label: "Moyenne", key: "mean" },
              { label: "Minimum", key: "min" },
              { label: "Maximum", key: "max" },
            ].map(({ label, key }) => (
              <div key={key} className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="text-sm text-gray-500">{label}</div>
                <div className="text-3xl font-bold text-gray-800 mt-1">
                  {stats?.[key] !== undefined
                    ? `${Math.round(stats[key] * 10) / 10}${selectedMetric.unit}`
                    : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1">Sur {duration.label}</div>
              </div>
            ))}
          </div>

          {/* Graphique */}
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-gray-900">
                {selectedMetric.label} — {selectedDevice?.name}
              </h2>
              <span className="text-sm text-gray-400">{formattedChart.length} points</span>
            </div>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Chargement des données...
              </div>
            ) : formattedChart.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400">
                Aucune donnée disponible pour cette période
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={formattedChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    domain={["auto", "auto"]}
                    unit={selectedMetric.unit}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}${selectedMetric.unit}`, selectedMetric.label]}
                    labelStyle={{ color: "#374151", fontWeight: 600 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={selectedMetric.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm p-16 text-center">
          <div className="text-5xl mb-4">📊</div>
          <div className="text-gray-500 text-lg">Sélectionnez un équipement pour visualiser ses métriques</div>
        </div>
      )}
    </div>
  );
}
