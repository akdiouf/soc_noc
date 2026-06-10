import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { devices as devicesApi } from "../services/api";
import { StatusDot } from "../components/common/StatusDot";
import type { Device, DeviceType, DeviceSite, DeviceStatus } from "../types";
import { Search, Plus, Settings, Wrench, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { DeviceFormModal } from "./DeviceFormModal";

const DEVICE_TYPE_LABELS: Record<string, string> = {
  router: "Routeur", switch: "Switch", firewall: "Firewall",
  server: "Serveur", hypervisor: "Hyperviseur", virtual_machine: "VM",
  ups: "UPS", pdu: "PDU", crac: "CRAC", crah: "CRAH",
  generator: "Groupe élec.", chiller: "Refroidisseur",
  access_control: "Ctrl. accès", camera: "Caméra",
  storage: "Stockage", nas: "NAS", san: "SAN", other: "Autre",
};

const DEVICE_TYPE_ICON: Record<string, string> = {
  router: "🌐", switch: "🔀", firewall: "🛡️",
  server: "🖥️", hypervisor: "💻", virtual_machine: "☁️",
  ups: "🔋", pdu: "🔌", crac: "❄️", crah: "❄️",
  generator: "⚡", chiller: "🧊",
  access_control: "🔐", camera: "📷",
  storage: "💾", nas: "🗄️", san: "🗄️", other: "📦",
};

export function DevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<DeviceType | "">("");
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | "">("");
  const [page, setPage] = useState(1);
  const [modalDevice, setModalDevice] = useState<Device | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["devices", { search, siteFilter, typeFilter, statusFilter, page }],
    queryFn: () => devicesApi.list({
      search: search || undefined,
      site: siteFilter || undefined,
      device_type: typeFilter || undefined,
      status: statusFilter || undefined,
      page,
      size: 50,
    }),
    refetchInterval: 30_000,
  });

  const { data: byType } = useQuery({
    queryKey: ["devices", "by-type"],
    queryFn: () => devicesApi.byType(),
    refetchInterval: 60_000,
  });

  const { data: byStatus } = useQuery({
    queryKey: ["devices", "by-status"],
    queryFn: () => devicesApi.byStatus(),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      toast.success("Équipement supprimé");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      devicesApi.toggleMaintenance(id, enable),
    onSuccess: (_, { enable }) => {
      toast.success(enable ? "Équipement mis en maintenance" : "Maintenance terminée");
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / 50);

  return (
    <>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Équipements</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{data?.total || 0} équipements</span>
          <button
            onClick={() => setModalDevice(null)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      </div>

      {/* Résumé par type */}
      {byType && byType.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byType.map(({ type, count }: { type: string; count: number }) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type === typeFilter ? "" : type as DeviceType)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                typeFilter === type
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              <span>{DEVICE_TYPE_ICON[type] || "📦"}</span>
              <span>{DEVICE_TYPE_LABELS[type] || type}</span>
              <span className={typeFilter === type ? "text-blue-200" : "text-gray-400"}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Résumé par statut */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {(byStatus || []).map(({ status, count }: { status: string; count: number }) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status === statusFilter ? "" : status as DeviceStatus)}
            className={`rounded-lg border p-3 text-center transition-all ${
              statusFilter === status ? "ring-2 ring-blue-500" : ""
            } ${
              status === "up" ? "bg-green-50 border-green-200" :
              status === "down" ? "bg-red-50 border-red-200" :
              status === "critical" ? "bg-red-100 border-red-300" :
              status === "warning" ? "bg-orange-50 border-orange-200" :
              "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <StatusDot status={status as DeviceStatus} />
              <span className="font-bold text-lg">{count}</span>
            </div>
            <div className="text-xs text-gray-500 capitalize">{status}</div>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher (nom, IP, hostname)..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={siteFilter}
          onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les sites</option>
          {Array.from(new Set((data?.items || []).map((d: Device) => d.site).filter(Boolean)))
            .sort()
            .map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as DeviceType | ""); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les types</option>
          <optgroup label="Réseau">
            <option value="router">Routeurs</option>
            <option value="switch">Switchs</option>
            <option value="firewall">Firewalls</option>
          </optgroup>
          <optgroup label="Serveurs">
            <option value="server">Serveurs</option>
            <option value="hypervisor">Hyperviseurs</option>
          </optgroup>
          <optgroup label="Infra physique">
            <option value="ups">UPS / Onduleurs</option>
            <option value="pdu">PDU</option>
            <option value="crac">CRAC/CRAH</option>
            <option value="generator">Groupes électrogènes</option>
            <option value="chiller">Refroidisseurs</option>
          </optgroup>
          <optgroup label="Sécurité">
            <option value="access_control">Contrôle d'accès</option>
            <option value="camera">Caméras</option>
          </optgroup>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Équipement</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">IP</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Site</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Emplacement</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Statut</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Dernier poll</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            )}
            {!isLoading && !data?.items.length && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucun équipement trouvé</td></tr>
            )}
            {(data?.items || []).map((device) => (
              <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{DEVICE_TYPE_ICON[device.device_type] || "📦"}</span>
                    <div>
                      <div className="font-medium text-gray-900">{device.name}</div>
                      {device.hostname && (
                        <div className="text-xs text-gray-400">{device.hostname}</div>
                      )}
                    </div>
                    {device.is_critical && (
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">CRITIQUE</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{device.ip_address}</td>
                <td className="px-4 py-3 text-gray-600">{DEVICE_TYPE_LABELS[device.device_type] || device.device_type}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">
                    {device.site}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {[device.datacenter, device.room, device.rack, device.rack_unit ? `U${device.rack_unit}` : null]
                    .filter(Boolean).join(" › ")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusDot status={device.status} />
                    <span className="text-gray-700 capitalize">{device.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {device.last_poll
                    ? new Date(device.last_poll).toLocaleTimeString("fr-FR")
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title="Modifier"
                      onClick={() => setModalDevice(device)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      title={device.status === "maintenance" ? "Sortir de maintenance" : "Mettre en maintenance"}
                      onClick={() => maintenanceMutation.mutate({
                        id: device.id,
                        enable: device.status !== "maintenance",
                      })}
                      className={`p-1.5 rounded ${
                        device.status === "maintenance"
                          ? "text-blue-600 bg-blue-50 hover:bg-blue-100"
                          : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                    <button
                      title="Supprimer"
                      onClick={() => setDeleteTarget(device)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {((page - 1) * 50) + 1}–{Math.min(page * 50, data?.total || 0)} sur {data?.total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                ← Précédent
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {modalDevice !== undefined && (
      <DeviceFormModal
        device={modalDevice}
        onClose={() => setModalDevice(undefined)}
      />
    )}

    {deleteTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Supprimer l'équipement</h3>
              <p className="text-sm text-gray-500">Cette action est irréversible.</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-sm">
            <div className="font-medium text-gray-900">{deleteTarget.name}</div>
            <div className="text-gray-500 font-mono text-xs mt-0.5">{deleteTarget.ip_address}</div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
