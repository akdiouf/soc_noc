import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { threatIntel } from "../../services/api";
import type { IOCType, IOC } from "../../types";
import toast from "react-hot-toast";
import {
  ShieldAlert, RefreshCw, Search, AlertTriangle,
  CheckCircle, XCircle, ExternalLink, Database,
} from "lucide-react";

const THREAT_LEVEL_LABELS: Record<number, string> = {
  1: "Élevé", 2: "Moyen", 3: "Faible", 4: "Indéfini",
};
const THREAT_LEVEL_COLORS: Record<number, string> = {
  1: "bg-red-100 text-red-800",
  2: "bg-orange-100 text-orange-800",
  3: "bg-yellow-100 text-yellow-800",
  4: "bg-gray-100 text-gray-600",
};
const TLP_COLORS: Record<string, string> = {
  white: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export function ThreatIntelPage() {
  const qc = useQueryClient();
  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState<null | { found: boolean; iocs: IOC[]; threat_level?: number }>(null);
  const [typeFilter, setTypeFilter] = useState<IOCType | "">("");
  const [tlpFilter, setTlpFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const { data: status } = useQuery({
    queryKey: ["misp-status"],
    queryFn: threatIntel.status,
    refetchInterval: 60_000,
  });
  const { data: stats } = useQuery({
    queryKey: ["misp-stats"],
    queryFn: threatIntel.stats,
  });
  const { data: iocList, isLoading } = useQuery({
    queryKey: ["misp-iocs", typeFilter, tlpFilter, levelFilter, searchText, page],
    queryFn: () =>
      threatIntel.listIOCs({
        ioc_type: typeFilter || undefined,
        tlp: tlpFilter || undefined,
        threat_level: levelFilter ? Number(levelFilter) : undefined,
        search: searchText || undefined,
        page,
        size: 50,
      }),
  });
  const { data: events } = useQuery({
    queryKey: ["misp-events"],
    queryFn: () => threatIntel.events(7),
  });

  const syncMutation = useMutation({
    mutationFn: threatIntel.triggerSync,
    onSuccess: () => {
      toast.success("Synchronisation MISP lancée");
      qc.invalidateQueries({ queryKey: ["misp-stats"] });
      qc.invalidateQueries({ queryKey: ["misp-iocs"] });
    },
    onError: () => toast.error("Échec du lancement de la synchronisation"),
  });

  const lookupMutation = useMutation({
    mutationFn: ({ value }: { value: string }) =>
      threatIntel.lookup(value),
    onSuccess: (data) => setLookupResult(data),
    onError: () => toast.error("Erreur lors de la recherche IOC"),
  });

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupValue.trim()) return;
    lookupMutation.mutate({ value: lookupValue.trim() });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-7 h-7 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Threat Intelligence</h1>
            <p className="text-sm text-gray-500">MISP — Indicateurs de Compromission</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* MISP status badge */}
          {status && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
              status.connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {status.connected
                ? <CheckCircle className="w-4 h-4" />
                : <XCircle className="w-4 h-4" />}
              {status.connected ? `MISP connecté${status.version ? ` v${status.version}` : ""}` : "MISP hors ligne"}
            </div>
          )}
          <a
            href="http://localhost:8081"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100"
          >
            <ExternalLink className="w-4 h-4" />
            Ouvrir MISP
          </a>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Synchroniser
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total IOCs" value={stats.total} icon={<Database className="w-5 h-5 text-purple-500" />} />
          {Object.entries(stats.by_threat_level).map(([level, count]) => (
            <StatCard
              key={level}
              label={`Niveau ${level}`}
              value={count as number}
              icon={<ShieldAlert className="w-5 h-5 text-orange-500" />}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* IOC Lookup */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Search className="w-4 h-4" /> Recherche IOC
          </h2>
          <form onSubmit={handleLookup} className="space-y-3">
            <input
              type="text"
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              placeholder="IP, domaine, hash, URL…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="submit"
              disabled={lookupMutation.isPending}
              className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
            >
              {lookupMutation.isPending ? "Recherche…" : "Vérifier"}
            </button>
          </form>
          {lookupResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              lookupResult.found ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"
            }`}>
              {lookupResult.found ? (
                <>
                  <p className="font-semibold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> IOC trouvé dans MISP
                  </p>
                  {lookupResult.threat_level && (
                    <p className="text-red-600 mt-1">
                      Niveau de menace : <strong>{THREAT_LEVEL_LABELS[lookupResult.threat_level]}</strong>
                    </p>
                  )}
                  <p className="text-red-600">{lookupResult.iocs.length} entrée(s) correspondante(s)</p>
                </>
              ) : (
                <p className="font-semibold text-green-700 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Non trouvé dans le cache MISP
                </p>
              )}
            </div>
          )}
        </div>

        {/* Recent MISP events */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Événements MISP récents (7j)</h2>
          {!events || events.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Aucun événement récent</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.slice(0, 15).map((ev) => (
                <div key={ev.event_id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                  <Badge
                    label={THREAT_LEVEL_LABELS[ev.threat_level] || "?"}
                    color={THREAT_LEVEL_COLORS[ev.threat_level] || "bg-gray-100 text-gray-600"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.title}</p>
                    <p className="text-xs text-gray-500">
                      #{ev.event_id} · {ev.attribute_count} attributs
                      {ev.org && ` · ${ev.org}`}
                      {ev.date && ` · ${ev.date}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* IOC Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <h2 className="font-semibold text-gray-800 mr-auto">Cache IOC local</h2>
          <input
            type="text"
            placeholder="Filtrer par valeur…"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 w-48"
          />
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as IOCType | ""); setPage(1); }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Tous les types</option>
            {["ip-dst","ip-src","domain","hostname","url","md5","sha256","email-src"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Tous niveaux</option>
            <option value="1">Élevé</option>
            <option value="2">Moyen</option>
            <option value="3">Faible</option>
            <option value="4">Indéfini</option>
          </select>
          <select
            value={tlpFilter}
            onChange={(e) => { setTlpFilter(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Tous TLP</option>
            {["white","green","amber","red"].map((t) => (
              <option key={t} value={t}>TLP:{t.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Valeur</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Menace</th>
                <th className="px-4 py-3 text-left">TLP</th>
                <th className="px-4 py-3 text-left">Événement MISP</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Hits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chargement…</td></tr>
              ) : !iocList?.items.length ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Aucun IOC — lancez une synchronisation MISP.
                </td></tr>
              ) : (
                iocList.items.map((ioc: IOC) => (
                  <tr key={ioc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800 max-w-xs truncate" title={ioc.value}>
                      {ioc.value}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{ioc.ioc_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={THREAT_LEVEL_LABELS[ioc.threat_level] || String(ioc.threat_level)}
                        color={THREAT_LEVEL_COLORS[ioc.threat_level] || "bg-gray-100 text-gray-600"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={`TLP:${ioc.tlp.toUpperCase()}`}
                        color={TLP_COLORS[ioc.tlp] || "bg-gray-100 text-gray-600"}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate" title={ioc.misp_event_title || ""}>
                      #{ioc.misp_event_id} {ioc.misp_event_title}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{ioc.category || "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{ioc.hit_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {iocList && iocList.total > 50 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{iocList.total} IOCs au total</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="px-3 py-1">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 50 >= iocList.total}
                className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {stats?.last_sync && (
        <p className="text-xs text-gray-400 text-right">
          Dernière synchronisation : {new Date(stats.last_sync).toLocaleString("fr-FR")}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
      {icon}
      <div>
        <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
