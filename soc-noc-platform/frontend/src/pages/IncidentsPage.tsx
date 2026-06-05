import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { incidents as incidentsApi } from "../services/api";
import type { Incident, IncidentSeverity, IncidentStatus, IncidentType } from "../types";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Plus, X, Clock, AlertTriangle, MessageSquare,
  ChevronRight, Save, Edit2, User, Tag, ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_CONFIG: Record<IncidentSeverity, { label: string; color: string; border: string }> = {
  p1: { label: "P1 — Critique", color: "bg-red-900 text-white",          border: "border-l-red-600" },
  p2: { label: "P2 — Majeur",   color: "bg-red-100 text-red-800",        border: "border-l-red-400" },
  p3: { label: "P3 — Modéré",   color: "bg-orange-100 text-orange-800",  border: "border-l-orange-400" },
  p4: { label: "P4 — Mineur",   color: "bg-yellow-100 text-yellow-800",  border: "border-l-yellow-400" },
  p5: { label: "P5 — Info",     color: "bg-gray-100 text-gray-700",      border: "border-l-gray-300" },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; color: string }> = {
  open:        { label: "Ouvert",      color: "bg-red-100 text-red-700" },
  in_progress: { label: "En cours",   color: "bg-blue-100 text-blue-700" },
  pending:     { label: "En attente", color: "bg-yellow-100 text-yellow-700" },
  resolved:    { label: "Résolu",     color: "bg-green-100 text-green-700" },
  closed:      { label: "Fermé",      color: "bg-gray-100 text-gray-600" },
  post_mortem: { label: "Post-mortem",color: "bg-purple-100 text-purple-700" },
};

const TYPE_LABELS: Record<IncidentType, string> = {
  network_outage: "Panne réseau", server_down: "Serveur hors service",
  performance_degradation: "Dégradation perf.", power_failure: "Coupure électrique",
  cooling_failure: "Panne climatisation", hardware_failure: "Panne matériel",
  capacity_issue: "Problème capacité", security_breach: "Violation sécurité",
  intrusion_attempt: "Tentative intrusion", data_leak: "Fuite de données",
  ransomware: "Ransomware", ddos: "DDoS",
  unauthorized_access: "Accès non autorisé", malware: "Malware", phishing: "Phishing",
};

const STATUS_TRANSITIONS: Record<IncidentStatus, { next: IncidentStatus; label: string; color: string }[]> = {
  open:        [{ next: "in_progress", label: "Prendre en charge", color: "blue" }],
  in_progress: [
    { next: "pending",  label: "Mettre en attente", color: "yellow" },
    { next: "resolved", label: "Marquer résolu",    color: "green" },
  ],
  pending:     [{ next: "in_progress", label: "Reprendre",         color: "blue" }],
  resolved:    [
    { next: "closed",      label: "Fermer",        color: "gray" },
    { next: "post_mortem", label: "Post-mortem",   color: "purple" },
  ],
  post_mortem: [{ next: "closed", label: "Archiver",              color: "gray" }],
  closed:      [],
};

const TEAM_OPTIONS = ["NOC", "SOC", "Réseau", "Systèmes", "Sécurité", "Infrastructure"];

function formatMTTR(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? `${m}m` : ""}`;
}

function btnClass(color: string) {
  const map: Record<string, string> = {
    blue:   "border-blue-300 text-blue-700 hover:bg-blue-50",
    green:  "border-green-300 text-green-700 hover:bg-green-50",
    yellow: "border-yellow-300 text-yellow-700 hover:bg-yellow-50",
    gray:   "border-gray-300 text-gray-600 hover:bg-gray-50",
    purple: "border-purple-300 text-purple-700 hover:bg-purple-50",
  };
  return `px-3 py-1.5 text-xs border rounded-lg transition-colors ${map[color] || map.gray}`;
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function IncidentCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", severity: "p3" as IncidentSeverity, incident_type: "" as IncidentType | "",
    description: "", team: "", impact_description: "",
    affected_users_count: 0, impacted_services_raw: "",
  });

  const mutation = useMutation({
    mutationFn: () => incidentsApi.create({
      title: form.title,
      severity: form.severity,
      incident_type: form.incident_type || undefined,
      description: form.description || undefined,
      team: form.team || undefined,
      impact_description: form.impact_description || undefined,
      affected_users_count: form.affected_users_count,
      impacted_services: form.impacted_services_raw
        ? form.impacted_services_raw.split(",").map(s => s.trim()).filter(Boolean)
        : [],
    }),
    onSuccess: () => {
      toast.success("Incident déclaré");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
    onError: () => toast.error("Erreur lors de la création"),
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Déclarer un incident
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Ex : Panne switch cœur de réseau"
              value={form.title}
              onChange={e => set("title", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sévérité *</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                value={form.severity}
                onChange={e => set("severity", e.target.value)}
              >
                {(Object.keys(SEV_CONFIG) as IncidentSeverity[]).map(s => (
                  <option key={s} value={s}>{SEV_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                value={form.incident_type}
                onChange={e => set("incident_type", e.target.value)}
              >
                <option value="">— Non défini —</option>
                {(Object.entries(TYPE_LABELS) as [IncidentType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Équipe</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.team}
                onChange={e => set("team", e.target.value)}
              >
                <option value="">— Non assigné —</option>
                {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Utilisateurs impactés</label>
              <input
                type="number" min={0}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.affected_users_count}
                onChange={e => set("affected_users_count", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Services impactés</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="VPN, Mail, ERP (séparés par des virgules)"
              value={form.impacted_services_raw}
              onChange={e => set("impacted_services_raw", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description de l'impact</label>
            <textarea
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Décrivez l'impact sur les opérations..."
              value={form.impact_description}
              onChange={e => set("impact_description", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Contexte, symptômes observés..."
              value={form.description}
              onChange={e => set("description", e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.title || mutation.isPending}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Création..." : "Déclarer l'incident"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function IncidentDetailPanel({ incidentId, onClose }: { incidentId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [editingRca, setEditingRca] = useState(false);
  const [rca, setRca] = useState({ root_cause: "", resolution_steps: "", lessons_learned: "" });

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => incidentsApi.get(incidentId),
  });

  useEffect(() => {
    if (incident && !editingRca) {
      setRca({
        root_cause: incident.root_cause || "",
        resolution_steps: incident.resolution_steps || "",
        lessons_learned: incident.lessons_learned || "",
      });
    }
  }, [incident]);

  const { data: timeline = [] } = useQuery({
    queryKey: ["incident", incidentId, "timeline"],
    queryFn: () => incidentsApi.getTimeline(incidentId),
    refetchInterval: 15_000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<Incident>) => incidentsApi.update(incidentId, payload),
    onSuccess: () => {
      toast.success("Incident mis à jour");
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => incidentsApi.addTimeline(incidentId, "comment", note),
    onSuccess: () => {
      setNote("");
      toast.success("Note ajoutée");
      qc.invalidateQueries({ queryKey: ["incident", incidentId, "timeline"] });
    },
  });

  const theHiveMutation = useMutation({
    mutationFn: () => incidentsApi.pushToTheHive(incidentId),
    onSuccess: () => {
      toast.success("Case TheHive créé");
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Erreur TheHive");
    },
  });

  const saveRca = () => {
    updateMutation.mutate(rca);
    setEditingRca(false);
  };

  if (isLoading || !incident) {
    return (
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l shadow-2xl flex items-center justify-center z-40">
        <div className="text-gray-400 text-sm">Chargement...</div>
      </div>
    );
  }

  const sev = SEV_CONFIG[incident.severity];
  const transitions = STATUS_TRANSITIONS[incident.status] || [];

  const TIMELINE_ICONS: Record<string, string> = {
    creation: "🆕", status_change: "🔄", comment: "💬",
    escalation: "⬆️", resolved: "✅", default: "📌",
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[520px] bg-white border-l shadow-2xl z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`p-4 border-b flex items-start justify-between gap-3 ${sev.color}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{incident.severity.toUpperCase()}</span>
            <span className="font-mono text-xs opacity-75">{incident.ticket_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[incident.status].color}`}>
              {STATUS_CONFIG[incident.status].label}
            </span>
            {incident.escalated && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Escaladé</span>
            )}
          </div>
          <h2 className="font-semibold text-sm mt-1 leading-tight">{incident.title}</h2>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-black/10 flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Actions */}
        {transitions.length > 0 && (
          <div className="p-4 border-b bg-gray-50 flex gap-2 flex-wrap">
            {transitions.map(t => (
              <button
                key={t.next}
                onClick={() => updateMutation.mutate({ status: t.next })}
                disabled={updateMutation.isPending}
                className={btnClass(t.color)}
              >
                {t.label}
              </button>
            ))}
            {!incident.escalated && incident.status !== "closed" && (
              <button
                onClick={() => updateMutation.mutate({ escalated: true })}
                className={btnClass("purple")}
              >
                Escalader
              </button>
            )}
          </div>
        )}

        {/* TheHive */}
        <div className="px-4 py-3 border-b bg-purple-50 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
            🐝 TheHive
          </span>
          {incident.thehive_case_id ? (
            <a
              href={`https://akisoc.team.akilee.tech/thehive/cases/${incident.thehive_case_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-700 hover:underline font-mono"
            >
              #{incident.thehive_case_id.slice(0, 12)}…
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <button
              onClick={() => theHiveMutation.mutate()}
              disabled={theHiveMutation.isPending}
              className="text-xs px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {theHiveMutation.isPending ? "Création..." : "Créer un case TheHive"}
            </button>
          )}
        </div>

        {/* Info */}
        <div className="p-4 space-y-3 border-b">
          {incident.description && (
            <p className="text-sm text-gray-600">{incident.description}</p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Détecté {formatDistanceToNow(new Date(incident.detected_at), { addSuffix: true, locale: fr })}</span>
            </div>
            {incident.team && (
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Équipe : {incident.team}</span>
              </div>
            )}
            {incident.incident_type && (
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>{TYPE_LABELS[incident.incident_type] || incident.incident_type}</span>
              </div>
            )}
            {incident.mttr_minutes && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>MTTR : <strong>{formatMTTR(incident.mttr_minutes)}</strong></span>
              </div>
            )}
          </div>

          {(incident.impacted_services.length > 0 || incident.affected_users_count > 0) && (
            <div className="bg-orange-50 rounded-lg p-3 text-xs space-y-1">
              {incident.impact_description && <p className="text-orange-800">{incident.impact_description}</p>}
              {incident.impacted_services.length > 0 && (
                <p className="text-orange-700">Services : <strong>{incident.impacted_services.join(", ")}</strong></p>
              )}
              {incident.affected_users_count > 0 && (
                <p className="text-orange-700"><strong>{incident.affected_users_count}</strong> utilisateurs impactés</p>
              )}
            </div>
          )}
        </div>

        {/* RCA */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Analyse & Résolution</h3>
            {!editingRca ? (
              <button onClick={() => setEditingRca(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <Edit2 className="w-3 h-3" /> Modifier
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingRca(false)} className="text-xs text-gray-500 hover:underline">Annuler</button>
                <button onClick={saveRca} className="flex items-center gap-1 text-xs text-green-600 hover:underline">
                  <Save className="w-3 h-3" /> Sauvegarder
                </button>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {["root_cause", "resolution_steps", "lessons_learned"].map((field) => {
              const labels: Record<string, string> = {
                root_cause: "Cause racine",
                resolution_steps: "Actions de résolution",
                lessons_learned: "Leçons apprises",
              };
              return (
                <div key={field}>
                  <div className="text-xs font-medium text-gray-500 mb-1">{labels[field]}</div>
                  {editingRca ? (
                    <textarea
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                      value={rca[field as keyof typeof rca]}
                      onChange={e => setRca(r => ({ ...r, [field]: e.target.value }))}
                    />
                  ) : (
                    <p className="text-sm text-gray-600">
                      {(incident as unknown as Record<string, string>)[field] || <span className="text-gray-400 italic">Non renseigné</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Timeline ({timeline.length})
          </h3>
          <div className="space-y-2 mb-4">
            {timeline.length === 0 && (
              <p className="text-xs text-gray-400 italic text-center py-4">Aucun événement</p>
            )}
            {timeline.map(entry => (
              <div key={entry.id} className="flex gap-2.5 text-xs">
                <span className="flex-shrink-0 mt-0.5 text-base leading-none">
                  {TIMELINE_ICONS[entry.event_type] || TIMELINE_ICONS.default}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 leading-relaxed">{entry.message}</p>
                  <div className="flex gap-2 text-gray-400 mt-0.5">
                    {entry.author_name && <span>{entry.author_name}</span>}
                    <span>{format(new Date(entry.created_at), "dd/MM HH:mm", { locale: fr })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add note */}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Ajouter une note..."
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && note.trim()) addNoteMutation.mutate(); }}
            />
            <button
              onClick={() => addNoteMutation.mutate()}
              disabled={!note.trim() || addNoteMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function IncidentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [sevFilter, setSevFilter] = useState<IncidentSeverity | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["incidents", { statusFilter, sevFilter, page }],
    queryFn: () => incidentsApi.list({ status: statusFilter || undefined, severity: sevFilter || undefined, page, size: 25 }),
    refetchInterval: 30_000,
  });

  const { data: mttrStats = [] } = useQuery({
    queryKey: ["incidents", "mttr"],
    queryFn: () => incidentsApi.mttrStats(30),
  });

  const quickUpdateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Incident> }) =>
      incidentsApi.update(id, payload),
    onSuccess: () => {
      toast.success("Incident mis à jour");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      if (detailId) qc.invalidateQueries({ queryKey: ["incident", detailId] });
    },
    onError: () => toast.error("Erreur de mise à jour"),
  });

  const totalPages = Math.ceil((data?.total || 0) / 25);

  return (
    <div className={`p-6 space-y-6 transition-all ${detailId ? "mr-[520px]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des incidents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.total ?? 0} incident{(data?.total ?? 0) > 1 ? "s" : ""}
            {statusFilter ? ` · ${STATUS_CONFIG[statusFilter as IncidentStatus]?.label}` : ""}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Déclarer un incident
        </button>
      </div>

      {/* MTTR KPIs */}
      {mttrStats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {mttrStats.map((stat: { severity: string; avg_mttr_minutes: number; count: number }) => (
            <div key={stat.severity} className={`rounded-xl border p-4 ${SEV_CONFIG[stat.severity as IncidentSeverity]?.color || "bg-gray-50"}`}>
              <div className="text-xs font-medium opacity-75">MTTR {stat.severity.toUpperCase()}</div>
              <div className="text-xl font-bold mt-1">{formatMTTR(stat.avg_mttr_minutes)}</div>
              <div className="text-xs opacity-60 mt-0.5">{stat.count} résolu(s)</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => { setStatusFilter(""); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            !statusFilter ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Tous
        </button>
        {(Object.keys(STATUS_CONFIG) as IncidentStatus[]).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s === statusFilter ? "" : s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
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
          onChange={e => { setSevFilter(e.target.value as IncidentSeverity | ""); setPage(1); }}
          className="ml-auto border rounded-lg px-3 py-1.5 text-sm text-gray-600"
        >
          <option value="">Toutes sévérités</option>
          {(Object.keys(SEV_CONFIG) as IncidentSeverity[]).map(s => (
            <option key={s} value={s}>{SEV_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && <div className="text-center text-gray-400 py-12">Chargement...</div>}
        {!isLoading && !data?.items.length && (
          <div className="bg-white rounded-xl border p-12 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="font-medium text-gray-600">Aucun incident dans cette catégorie</div>
          </div>
        )}
        {(data?.items || []).map(incident => {
          const sev = SEV_CONFIG[incident.severity];
          const isSelected = detailId === incident.id;
          return (
            <div
              key={incident.id}
              onClick={() => setDetailId(isSelected ? null : incident.id)}
              className={`bg-white rounded-xl border-l-4 border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all ${sev.border} ${isSelected ? "ring-2 ring-blue-400" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 px-2 py-0.5 text-xs font-bold rounded-md flex-shrink-0 ${sev.color}`}>
                  {incident.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-400">{incident.ticket_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[incident.status].color}`}>
                      {STATUS_CONFIG[incident.status].label}
                    </span>
                    {incident.escalated && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Escaladé ⬆️</span>
                    )}
                    {incident.incident_type && (
                      <span className="text-xs text-gray-400">{TYPE_LABELS[incident.incident_type]}</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mt-1 text-sm">{incident.title}</h3>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(incident.detected_at), { addSuffix: true, locale: fr })}
                    </span>
                    {incident.team && <span>👥 {incident.team}</span>}
                    {incident.mttr_minutes && <span>MTTR : <strong>{formatMTTR(incident.mttr_minutes)}</strong></span>}
                    {incident.impacted_services.length > 0 && (
                      <span>⚡ {incident.impacted_services.join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {STATUS_TRANSITIONS[incident.status]?.map(t => (
                    <button
                      key={t.next}
                      onClick={() => quickUpdateMutation.mutate({ id: incident.id, payload: { status: t.next } })}
                      className={btnClass(t.color)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      )}

      {/* Modals / Panels */}
      {createOpen && <IncidentCreateModal onClose={() => setCreateOpen(false)} />}
      {detailId && (
        <IncidentDetailPanel
          incidentId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
