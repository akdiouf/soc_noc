import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { devices as devicesApi } from "../services/api";
import type { Device, DeviceType, DeviceSite, MonitoringProtocol } from "../types";
import { X } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  device?: Device | null;
  onClose: () => void;
}

type Tab = "info" | "location" | "monitoring";

interface FormState {
  name: string;
  hostname: string;
  ip_address: string;
  device_type: DeviceType;
  site: DeviceSite;
  vendor: string;
  model: string;
  datacenter: string;
  room: string;
  rack: string;
  rack_unit: string;
  monitoring_protocol: MonitoringProtocol;
  snmp_community: string;
  poll_interval: number;
  is_monitored: boolean;
  is_critical: boolean;
  description: string;
  tags: string;
}

export function DeviceFormModal({ device, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!device;
  const [tab, setTab] = useState<Tab>("info");

  const [form, setForm] = useState<FormState>({
    name: device?.name ?? "",
    hostname: device?.hostname ?? "",
    ip_address: device?.ip_address ?? "",
    device_type: device?.device_type ?? "server",
    site: device?.site ?? "primary",
    vendor: device?.vendor ?? "",
    model: device?.model ?? "",
    datacenter: device?.datacenter ?? "",
    room: device?.room ?? "",
    rack: device?.rack ?? "",
    rack_unit: device?.rack_unit?.toString() ?? "",
    monitoring_protocol: device?.monitoring_protocol ?? "snmp_v2c",
    snmp_community: (device as any)?.snmp_community ?? "public",
    poll_interval: device?.poll_interval ?? 60,
    is_monitored: device?.is_monitored ?? true,
    is_critical: device?.is_critical ?? false,
    description: device?.description ?? "",
    tags: device?.tags?.join(", ") ?? "",
  });

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const buildPayload = () => ({
    name: form.name.trim(),
    hostname: form.hostname.trim() || undefined,
    ip_address: form.ip_address.trim(),
    device_type: form.device_type,
    site: form.site,
    vendor: form.vendor.trim() || undefined,
    model: form.model.trim() || undefined,
    datacenter: form.datacenter.trim() || undefined,
    room: form.room.trim() || undefined,
    rack: form.rack.trim() || undefined,
    rack_unit: form.rack_unit ? Number(form.rack_unit) : undefined,
    monitoring_protocol: form.monitoring_protocol,
    snmp_community: form.snmp_community.trim() || undefined,
    poll_interval: form.poll_interval,
    is_monitored: form.is_monitored,
    is_critical: form.is_critical,
    description: form.description.trim() || undefined,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? devicesApi.update(device!.id, buildPayload())
        : devicesApi.create(buildPayload()),
    onSuccess: () => {
      toast.success(isEdit ? "Équipement modifié" : "Équipement ajouté");
      qc.invalidateQueries({ queryKey: ["devices"] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Erreur lors de la sauvegarde");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const isSnmp =
    form.monitoring_protocol === "snmp_v1" ||
    form.monitoring_protocol === "snmp_v2c";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? `Modifier — ${device!.name}` : "Ajouter un équipement"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 shrink-0">
          {(["info", "location", "monitoring"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "info"
                ? "Identification"
                : t === "location"
                ? "Localisation"
                : "Monitoring"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* ── Tab: Identification ─────────────────────────────── */}
            {tab === "info" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nom *">
                    <input
                      required
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      className={input}
                      placeholder="sw-core-01"
                    />
                  </Field>
                  <Field label="Hostname">
                    <input
                      value={form.hostname}
                      onChange={(e) => set("hostname", e.target.value)}
                      className={input}
                      placeholder="sw-core-01.dc.local"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Adresse IP *">
                    <input
                      required
                      value={form.ip_address}
                      onChange={(e) => set("ip_address", e.target.value)}
                      className={`${input} font-mono`}
                      placeholder="192.168.1.1"
                    />
                  </Field>
                  <Field label="Site / Hébergeur *">
                    <input
                      list="site-suggestions"
                      value={form.site}
                      onChange={(e) => set("site", e.target.value)}
                      className={input}
                      placeholder="ex: contabo, ovh, primary..."
                    />
                    <datalist id="site-suggestions">
                      <option value="contabo" />
                      <option value="ovh" />
                      <option value="hetzner" />
                      <option value="aws" />
                      <option value="azure" />
                      <option value="gcp" />
                      <option value="primary" />
                      <option value="failover" />
                    </datalist>
                  </Field>
                </div>
                <Field label="Type *">
                  <select
                    value={form.device_type}
                    onChange={(e) => set("device_type", e.target.value as DeviceType)}
                    className={input}
                  >
                    <optgroup label="Réseau">
                      <option value="router">Routeur</option>
                      <option value="switch">Switch</option>
                      <option value="firewall">Firewall</option>
                      <option value="load_balancer">Load Balancer</option>
                      <option value="access_point">Point d'accès WiFi</option>
                    </optgroup>
                    <optgroup label="Serveurs">
                      <option value="server">Serveur</option>
                      <option value="hypervisor">Hyperviseur</option>
                      <option value="virtual_machine">Machine Virtuelle</option>
                    </optgroup>
                    <optgroup label="Stockage">
                      <option value="storage">Stockage</option>
                      <option value="nas">NAS</option>
                      <option value="san">SAN</option>
                    </optgroup>
                    <optgroup label="Infra physique">
                      <option value="ups">UPS / Onduleur</option>
                      <option value="pdu">PDU</option>
                      <option value="crac">CRAC</option>
                      <option value="crah">CRAH</option>
                      <option value="generator">Groupe électrogène</option>
                      <option value="ats">ATS</option>
                      <option value="chiller">Refroidisseur</option>
                    </optgroup>
                    <optgroup label="Sécurité physique">
                      <option value="access_control">Contrôle d'accès</option>
                      <option value="camera">Caméra</option>
                      <option value="smoke_detector">Détecteur fumée</option>
                    </optgroup>
                    <option value="other">Autre</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Constructeur">
                    <input
                      value={form.vendor}
                      onChange={(e) => set("vendor", e.target.value)}
                      className={input}
                      placeholder="Cisco, HP, Dell..."
                    />
                  </Field>
                  <Field label="Modèle">
                    <input
                      value={form.model}
                      onChange={(e) => set("model", e.target.value)}
                      className={input}
                      placeholder="Catalyst 9300"
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={2}
                    className={`${input} resize-none`}
                  />
                </Field>
                <Field label="Tags (séparés par virgule)">
                  <input
                    value={form.tags}
                    onChange={(e) => set("tags", e.target.value)}
                    className={input}
                    placeholder="core, prod, dmz"
                  />
                </Field>
              </>
            )}

            {/* ── Tab: Localisation ───────────────────────────────── */}
            {tab === "location" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Datacenter">
                    <input
                      value={form.datacenter}
                      onChange={(e) => set("datacenter", e.target.value)}
                      className={input}
                      placeholder="DC1"
                    />
                  </Field>
                  <Field label="Salle">
                    <input
                      value={form.room}
                      onChange={(e) => set("room", e.target.value)}
                      className={input}
                      placeholder="Salle A"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Rack">
                    <input
                      value={form.rack}
                      onChange={(e) => set("rack", e.target.value)}
                      className={input}
                      placeholder="R01"
                    />
                  </Field>
                  <Field label="Unité rack (U)">
                    <input
                      type="number"
                      min={1}
                      max={48}
                      value={form.rack_unit}
                      onChange={(e) => set("rack_unit", e.target.value)}
                      className={input}
                      placeholder="1"
                    />
                  </Field>
                </div>
              </>
            )}

            {/* ── Tab: Monitoring ─────────────────────────────────── */}
            {tab === "monitoring" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Protocole">
                    <select
                      value={form.monitoring_protocol}
                      onChange={(e) =>
                        set("monitoring_protocol", e.target.value as MonitoringProtocol)
                      }
                      className={input}
                    >
                      <optgroup label="SNMP">
                        <option value="snmp_v1">SNMP v1</option>
                        <option value="snmp_v2c">SNMP v2c</option>
                        <option value="snmp_v3">SNMP v3</option>
                      </optgroup>
                      <optgroup label="Industriel">
                        <option value="modbus_tcp">Modbus TCP</option>
                        <option value="modbus_rtu">Modbus RTU</option>
                        <option value="bacnet_ip">BACnet/IP</option>
                      </optgroup>
                      <optgroup label="Autre">
                        <option value="rest_api">REST API</option>
                        <option value="icmp">ICMP (Ping)</option>
                        <option value="ssh">SSH</option>
                        <option value="wmi">WMI</option>
                        <option value="ipmi">IPMI</option>
                      </optgroup>
                    </select>
                  </Field>
                  <Field label="Intervalle poll (s)">
                    <input
                      type="number"
                      min={10}
                      max={3600}
                      value={form.poll_interval}
                      onChange={(e) => set("poll_interval", Number(e.target.value))}
                      className={input}
                    />
                  </Field>
                </div>
                {isSnmp && (
                  <Field label="Communauté SNMP">
                    <input
                      value={form.snmp_community}
                      onChange={(e) => set("snmp_community", e.target.value)}
                      className={`${input} font-mono`}
                      placeholder="public"
                    />
                  </Field>
                )}
                <div className="flex gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_monitored}
                      onChange={(e) => set("is_monitored", e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Supervision active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.is_critical}
                      onChange={(e) => set("is_critical", e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Équipement critique</span>
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {mutation.isPending
                ? "Sauvegarde..."
                : isEdit
                ? "Enregistrer"
                : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input =
  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
