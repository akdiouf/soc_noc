import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alerts as alertsApi } from "../services/api";
import { AlertSeverityBadge } from "../components/common/AlertSeverityBadge";
import { useWebSocket } from "../hooks/useWebSocket";
import { useAlertStore } from "../store/alertStore";
import type { Alert, AlertSeverity, AlertStatus, AlertCategory } from "../types";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { CheckCheck, CheckCircle, Filter, Wifi, WifiOff } from "lucide-react";
import toast from "react-hot-toast";

const SEVERITY_ORDER: AlertSeverity[] = ["emergency", "critical", "warning", "info"];

export function AlertsPage() {
  const qc = useQueryClient();
  const { pushAlert, markAllRead } = useAlertStore();
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "">("");
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "">("active");
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // WebSocket pour les nouvelles alertes en temps réel
  const { connected } = useWebSocket("/ws/alerts", {
    onMessage: (msg) => {
      if (msg.type === "alert") {
        pushAlert(msg.data as Alert);
        qc.invalidateQueries({ queryKey: ["alerts"] });
        toast(`Nouvelle alerte: ${(msg.data as Alert).title}`, {
          icon: "🔔",
          duration: 4000,
        });
      }
    },
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["alerts", { severityFilter, statusFilter, categoryFilter, page }],
    queryFn: () => alertsApi.list({
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      page,
      size: 50,
    }),
    refetchInterval: 20_000,
  });

  const { data: counts } = useQuery({
    queryKey: ["alerts", "count"],
    queryFn: alertsApi.activeCount,
    refetchInterval: 10_000,
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => {
      toast.success("Alerte acquittée");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => alertsApi.resolve(id),
    onSuccess: () => {
      toast.success("Alerte résolue");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const bulkAckMutation = useMutation({
    mutationFn: () => alertsApi.bulkAcknowledge([...selected]),
    onSuccess: () => {
      toast.success(`${selected.size} alertes acquittées`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const totalPages = Math.ceil((data?.total || 0) / 50);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Alertes</h1>
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <Wifi className="w-3 h-3" /> Temps réel
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              <WifiOff className="w-3 h-3" /> Reconnexion...
            </span>
          )}
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => bulkAckMutation.mutate()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <CheckCheck className="w-4 h-4" />
            Acquitter ({selected.size})
          </button>
        )}
      </div>

      {/* Compteurs par sévérité */}
      <div className="grid grid-cols-4 gap-3">
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            onClick={() => setSeverityFilter(sev === severityFilter ? "" : sev)}
            className={`rounded-lg border p-3 text-center transition-all ${
              severityFilter === sev ? "ring-2 ring-blue-500" : ""
            } ${
              sev === "emergency" ? "bg-red-900 border-red-800 text-white" :
              sev === "critical" ? "bg-red-50 border-red-200" :
              sev === "warning" ? "bg-orange-50 border-orange-200" :
              "bg-blue-50 border-blue-200"
            }`}
          >
            <div className="text-3xl font-bold">{counts?.[sev] || 0}</div>
            <div className={`text-xs mt-1 font-medium ${sev === "emergency" ? "text-red-200" : "text-gray-600"}`}>
              {sev === "emergency" ? "URGENCE" :
               sev === "critical" ? "CRITIQUE" :
               sev === "warning" ? "AVERTISSEMENT" : "INFO"}
            </div>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Filter className="w-4 h-4" />
          Filtres :
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as AlertStatus | ""); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous statuts</option>
          <option value="active">Actives</option>
          <option value="acknowledged">Acquittées</option>
          <option value="resolved">Résolues</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value as AlertCategory | ""); setPage(1); }}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes catégories</option>
          <option value="availability">Disponibilité</option>
          <option value="performance">Performance</option>
          <option value="power">Alimentation</option>
          <option value="temperature">Température</option>
          <option value="cooling">Climatisation</option>
          <option value="security">Sécurité</option>
          <option value="intrusion">Intrusion</option>
        </select>
        <span className="ml-auto text-sm text-gray-500">{data?.total || 0} alertes</span>
      </div>

      {/* Table des alertes */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(data?.items.map(a => a.id) || []));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Sévérité</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Alerte</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Source</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Valeur</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Occurrences</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Dernière fois</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            )}
            {!isLoading && !data?.items.length && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="text-gray-400">Aucune alerte</div>
                </td>
              </tr>
            )}
            {(data?.items || []).map((alert) => (
              <tr
                key={alert.id}
                className={`hover:bg-gray-50 transition-colors ${
                  alert.severity === "emergency" ? "bg-red-50" : ""
                } ${selected.has(alert.id) ? "bg-blue-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(alert.id)}
                    onChange={() => toggleSelect(alert.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <AlertSeverityBadge severity={alert.severity} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 max-w-xs truncate">{alert.title}</div>
                  <div className="text-xs text-gray-400 max-w-xs truncate">{alert.message}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {alert.source_name || alert.source_ip || "—"}
                </td>
                <td className="px-4 py-3">
                  {alert.metric_value !== undefined && alert.metric_name ? (
                    <span className="font-mono text-gray-700">
                      {alert.metric_value}{alert.metric_unit || ""}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  {alert.occurrence_count > 1 ? (
                    <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full text-xs font-medium">
                      ×{alert.occurrence_count}
                    </span>
                  ) : "1"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {formatDistanceToNow(new Date(alert.last_seen), { addSuffix: true, locale: fr })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    alert.status === "active" ? "bg-red-100 text-red-700" :
                    alert.status === "acknowledged" ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {alert.status === "active" ? "Active" :
                     alert.status === "acknowledged" ? "Acquittée" : "Résolue"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {alert.status === "active" && (
                      <button
                        onClick={() => ackMutation.mutate(alert.id)}
                        title="Acquitter"
                        className="px-2.5 py-1 text-xs border border-yellow-300 text-yellow-700 rounded hover:bg-yellow-50"
                      >
                        ACK
                      </button>
                    )}
                    {alert.status !== "resolved" && (
                      <button
                        onClick={() => resolveMutation.mutate(alert.id)}
                        title="Résoudre"
                        className="px-2.5 py-1 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50"
                      >
                        Résoudre
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-sm">
            <span className="text-gray-500">Page {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">
                ← Précédent
              </button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
