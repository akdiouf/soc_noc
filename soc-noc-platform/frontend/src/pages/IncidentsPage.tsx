import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { incidents as incidentsApi } from "../services/api";
import type { Incident, IncidentSeverity, IncidentStatus } from "../types";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Clock, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

const SEV_CONFIG: Record<IncidentSeverity, { label: string; color: string }> = {
  p1: { label: "P1 — Critique", color: "bg-red-900 text-white" },
  p2: { label: "P2 — Majeur", color: "bg-red-100 text-red-800" },
  p3: { label: "P3 — Modéré", color: "bg-orange-100 text-orange-800" },
  p4: { label: "P4 — Mineur", color: "bg-yellow-100 text-yellow-800" },
  p5: { label: "P5 — Info", color: "bg-gray-100 text-gray-700" },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string }> = {
  open: { label: "Ouvert", color: "bg-red-100 text-red-700" },
  in_progress: { label: "En cours", color: "bg-blue-100 text-blue-700" },
  pending: { label: "En attente", color: "bg-yellow-100 text-yellow-700" },
  resolved: { label: "Résolu", color: "bg-green-100 text-green-700" },
  closed: { label: "Fermé", color: "bg-gray-100 text-gray-600" },
  post_mortem: { label: "Post-mortem", color: "bg-purple-100 text-purple-700" },
};

function formatMTTR(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? `${m}m` : ""}`;
}

export function IncidentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("open");
  const [sevFilter, setSevFilter] = useState<IncidentSeverity | "">("");
  const [selected, setSelected] = useState<Incident | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", { statusFilter, sevFilter, page }],
    queryFn: () => incidentsApi.list({
      status: statusFilter || undefined,
      severity: sevFilter || undefined,
      page,
      size: 25,
    }),
    refetchInterval: 30_000,
  });

  const { data: mttrStats } = useQuery({
    queryKey: ["incidents", "mttr"],
    queryFn: () => incidentsApi.mttrStats(30),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Incident> }) =>
      incidentsApi.update(id, payload),
    onSuccess: () => {
      toast.success("Incident mis à jour");
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const openCount = data?.items.filter(i => i.status === "open").length || 0;
  const inProgressCount = data?.items.filter(i => i.status === "in_progress").length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des incidents</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
          <Plus className="w-4 h-4" />
          Déclarer un incident
        </button>
      </div>

      {/* KPI MTTR */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {(mttrStats || []).map((stat: { severity: string; avg_mttr_minutes: number; count: number }) => (
          <div key={stat.severity} className={`rounded-lg border p-4 ${SEV_CONFIG[stat.severity as IncidentSeverity]?.color || "bg-gray-50"}`}>
            <div className="text-xs font-medium opacity-75 mb-1">MTTR {stat.severity.toUpperCase()}</div>
            <div className="text-2xl font-bold">{formatMTTR(stat.avg_mttr_minutes)}</div>
            <div className="text-xs opacity-60 mt-1">{stat.count} incident(s)</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        {(["open", "in_progress", "pending", "resolved", "closed"] as IncidentStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s === statusFilter ? "" : s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              statusFilter === s
                ? "ring-2 ring-blue-500 " + STATUS_CONFIG[s].color
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {STATUS_CONFIG[s].label}
          </button>
        ))}
        <select
          value={sevFilter}
          onChange={(e) => { setSevFilter(e.target.value as IncidentSeverity | ""); setPage(1); }}
          className="ml-auto border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Toutes sévérités</option>
          <option value="p1">P1 — Critique</option>
          <option value="p2">P2 — Majeur</option>
          <option value="p3">P3 — Modéré</option>
          <option value="p4">P4 — Mineur</option>
        </select>
      </div>

      {/* Liste incidents */}
      <div className="space-y-3">
        {isLoading && <div className="text-center text-gray-400 py-8">Chargement...</div>}
        {!isLoading && !data?.items.length && (
          <div className="bg-white rounded-xl border p-12 text-center">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-gray-400">Aucun incident dans cette catégorie</div>
          </div>
        )}
        {(data?.items || []).map((incident) => (
          <div
            key={incident.id}
            className={`bg-white rounded-xl border shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow ${
              incident.severity === "p1" ? "border-l-4 border-l-red-600" :
              incident.severity === "p2" ? "border-l-4 border-l-red-400" :
              incident.severity === "p3" ? "border-l-4 border-l-orange-400" :
              "border-l-4 border-l-gray-300"
            }`}
            onClick={() => setSelected(selected?.id === incident.id ? null : incident)}
          >
            <div className="flex items-start gap-4">
              <span className={`mt-0.5 px-2.5 py-1 text-xs font-bold rounded-lg flex-shrink-0 ${SEV_CONFIG[incident.severity]?.color}`}>
                {incident.severity.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-xs text-gray-400">{incident.ticket_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[incident.status]?.color}`}>
                    {STATUS_CONFIG[incident.status]?.label}
                  </span>
                  {incident.escalated && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                      Escaladé
                    </span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 mt-1">{incident.title}</h3>
                {incident.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{incident.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(incident.detected_at), { addSuffix: true, locale: fr })}
                  </span>
                  {incident.team && <span>Équipe: {incident.team}</span>}
                  {incident.mttr_minutes && (
                    <span>MTTR: <strong>{formatMTTR(incident.mttr_minutes)}</strong></span>
                  )}
                  {incident.impacted_services.length > 0 && (
                    <span>Services: {incident.impacted_services.join(", ")}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {incident.status === "open" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMutation.mutate({ id: incident.id, payload: { status: "in_progress" } });
                    }}
                    className="px-3 py-1.5 text-xs border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                  >
                    Prendre en charge
                  </button>
                )}
                {incident.status === "in_progress" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMutation.mutate({ id: incident.id, payload: { status: "resolved" } });
                    }}
                    className="px-3 py-1.5 text-xs border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
                  >
                    Résoudre
                  </button>
                )}
              </div>
            </div>

            {/* Détail expandable */}
            {selected?.id === incident.id && (
              <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-gray-700 mb-1">Impact</div>
                  <div className="text-gray-600">
                    {incident.impact_description || "Non renseigné"}
                  </div>
                  {incident.affected_users_count > 0 && (
                    <div className="text-gray-500 mt-1">
                      {incident.affected_users_count} utilisateurs impactés
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-medium text-gray-700 mb-1">Cause racine</div>
                  <div className="text-gray-600">{incident.root_cause || "En cours d'analyse"}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700 mb-1">Actions</div>
                  <div className="text-gray-600">{incident.resolution_steps || "En cours"}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
