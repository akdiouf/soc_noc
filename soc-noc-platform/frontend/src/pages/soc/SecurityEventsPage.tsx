import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { alerts as alertsApi } from "../../services/api";
import { AlertSeverityBadge } from "../../components/common/AlertSeverityBadge";
import { useWebSocket } from "../../hooks/useWebSocket";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Shield, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import type { Alert } from "../../types";

const SECURITY_CATEGORIES = [
  { key: "security", label: "Sécurité", icon: "🛡️" },
  { key: "intrusion", label: "Intrusion", icon: "🚨" },
  { key: "anomaly", label: "Anomalie", icon: "⚠️" },
  { key: "compliance", label: "Conformité", icon: "📋" },
];

export function SecurityEventsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>("security");
  const [liveEvents, setLiveEvents] = useState<Alert[]>([]);

  const { connected } = useWebSocket("/ws/alerts", {
    onMessage: (msg) => {
      if (msg.type === "security_event" || (msg.type === "alert" && ["security", "intrusion"].includes((msg.data as Alert).category))) {
        const event = msg.data as Alert;
        setLiveEvents(prev => [event, ...prev].slice(0, 50));
        toast(`Événement sécurité: ${event.title}`, {
          icon: "🛡️",
          duration: 6000,
          style: { background: "#1e1e2e", color: "#fff" },
        });
      }
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", { category: categoryFilter, size: 50 }],
    queryFn: () => alertsApi.list({ category: categoryFilter as any, size: 50 }),
    refetchInterval: 20_000,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Centre d'opérations sécurité (SOC)</h1>
        {connected ? (
          <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <Wifi className="w-3 h-3" /> Surveillance active
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            <WifiOff className="w-3 h-3" /> Reconnexion...
          </span>
        )}
      </div>

      {/* Événements temps réel (flux live) */}
      {liveEvents.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-gray-300">Événements en temps réel</span>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {liveEvents.map((evt, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <AlertSeverityBadge severity={evt.severity} />
                <span className="text-gray-200 flex-1 truncate">{evt.title}</span>
                <span className="text-gray-500 text-xs flex-shrink-0">
                  {formatDistanceToNow(new Date(evt.last_seen), { addSuffix: true, locale: fr })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catégories */}
      <div className="flex gap-3">
        {SECURITY_CATEGORIES.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
              categoryFilter === key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Table événements */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">Sévérité</th>
              <th className="px-4 py-3 text-left">Événement</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Détail</th>
              <th className="px-4 py-3 text-left">Horodatage</th>
              <th className="px-4 py-3 text-left">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Analyse des événements...</td></tr>
            )}
            {(data?.items || []).map((event) => (
              <tr key={event.id} className={`hover:bg-gray-50 ${event.severity === "emergency" ? "bg-red-50" : ""}`}>
                <td className="px-4 py-3"><AlertSeverityBadge severity={event.severity} /></td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 max-w-sm truncate">{event.title}</div>
                  <div className="text-xs text-gray-400">{event.category}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {event.source_ip || event.source_name || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                  {event.message}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {formatDistanceToNow(new Date(event.last_seen), { addSuffix: true, locale: fr })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    event.status === "active" ? "bg-red-100 text-red-700" :
                    event.status === "acknowledged" ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {event.status}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && !data?.items.length && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <div className="text-4xl mb-2">🛡️</div>
                  <div className="text-gray-400">Aucun événement détecté</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
