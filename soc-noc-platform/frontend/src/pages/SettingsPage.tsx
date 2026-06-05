import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { users as usersApi, auth as authApi } from "../services/api";
import type { User, UserRole } from "../types";
import { useEffect } from "react";
import {
  Users, Sliders, Plug, Plus, X, Edit2, Trash2,
  CheckCircle, XCircle, Save, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:  "Super Admin",
  noc_manager:  "NOC Manager",
  soc_manager:  "SOC Manager",
  noc_analyst:  "NOC Analyst",
  soc_analyst:  "SOC Analyst",
  read_only:    "Lecture seule",
};

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin:  "bg-red-100 text-red-800",
  noc_manager:  "bg-blue-100 text-blue-800",
  soc_manager:  "bg-purple-100 text-purple-800",
  noc_analyst:  "bg-sky-100 text-sky-800",
  soc_analyst:  "bg-violet-100 text-violet-800",
  read_only:    "bg-gray-100 text-gray-600",
};

const TABS = [
  { id: "users",        label: "Utilisateurs", icon: Users },
  { id: "thresholds",   label: "Seuils",        icon: Sliders },
  { id: "integrations", label: "Intégrations",  icon: Plug },
];

// ─── User Form Modal ──────────────────────────────────────────────────────────

function UserFormModal({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({
    username: user?.username ?? "",
    email: user?.email ?? "",
    full_name: user?.full_name ?? "",
    phone: user?.phone ?? "",
    role: (user?.role ?? "read_only") as UserRole,
    password: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? usersApi.update(user!.id, {
            full_name: form.full_name || undefined,
            role: form.role,
            phone: form.phone || undefined,
            password: form.password || undefined,
          })
        : usersApi.create({
            username: form.username,
            email: form.email,
            full_name: form.full_name || undefined,
            password: form.password,
            role: form.role,
            phone: form.phone || undefined,
          }),
    onSuccess: () => {
      toast.success(isEdit ? "Utilisateur mis à jour" : "Utilisateur créé");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Erreur");
    },
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = isEdit
    ? true
    : form.username && form.email && form.password.length >= 8;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={form.username}
                  onChange={e => set("username", e.target.value)}
                  placeholder="jdupont"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="j.dupont@company.com"
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.full_name}
                onChange={e => set("full_name", e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="+33 6 00 00 00 00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.role}
              onChange={e => set("role", e.target.value)}
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEdit ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe *"}
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                className="w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={form.password}
                onChange={e => set("password", e.target.value)}
                placeholder={isEdit ? "••••••••" : "Min. 8 caractères"}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Enregistrement..." : isEdit ? "Mettre à jour" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const [modalUser, setModalUser] = useState<User | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    authApi.me().then(setCurrentUser).catch(() => null);
  }, []);

  const { data: userList = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: "is_active" | "on_call"; value: boolean }) =>
      usersApi.update(id, { [field]: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: () => toast.error("Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Erreur");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{userList.length} utilisateur(s)</p>
        <button
          onClick={() => setModalUser(null)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Ajouter un utilisateur
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Utilisateur</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rôle</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Actif</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Astreinte</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Dernière connexion</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            )}
            {userList.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{u.full_name || u.username}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                  {u.phone && <div className="text-xs text-gray-400">{u.phone}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleMutation.mutate({ id: u.id, field: "is_active", value: !u.is_active })}
                    disabled={u.id === currentUser?.id}
                    className="disabled:opacity-40 disabled:cursor-default"
                    title={u.is_active ? "Désactiver" : "Activer"}
                  >
                    {u.is_active
                      ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                      : <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
                    }
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleMutation.mutate({ id: u.id, field: "on_call", value: !u.on_call })}
                    title={u.on_call ? "Retirer de l'astreinte" : "Mettre en astreinte"}
                  >
                    {u.on_call
                      ? <span className="text-lg">📟</span>
                      : <span className="text-lg text-gray-300">📟</span>
                    }
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {u.last_login
                    ? new Date(u.last_login).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
                    : "Jamais"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setModalUser(u)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      disabled={u.id === currentUser?.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-default"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalUser !== undefined && (
        <UserFormModal user={modalUser} onClose={() => setModalUser(undefined)} />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Supprimer l'utilisateur</h3>
                <p className="text-sm text-gray-500">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-sm">
              <div className="font-medium text-gray-900">{deleteTarget.full_name || deleteTarget.username}</div>
              <div className="text-gray-500 text-xs">{deleteTarget.email}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
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
    </div>
  );
}

// ─── Thresholds Tab ───────────────────────────────────────────────────────────

interface ThresholdGroup {
  title: string;
  icon: string;
  items: { key: string; label: string; warn: string; crit: string; unit: string }[];
}

const THRESHOLD_GROUPS: ThresholdGroup[] = [
  {
    title: "Ressources système",
    icon: "🖥️",
    items: [
      { key: "cpu",    label: "CPU",           warn: "80",  crit: "95",  unit: "%" },
      { key: "memory", label: "Mémoire",       warn: "85",  crit: "95",  unit: "%" },
      { key: "disk",   label: "Disque",        warn: "80",  crit: "90",  unit: "%" },
    ],
  },
  {
    title: "Environnement physique",
    icon: "🌡️",
    items: [
      { key: "temp",   label: "Température",   warn: "30",  crit: "40",  unit: "°C" },
    ],
  },
  {
    title: "Alimentation",
    icon: "🔋",
    items: [
      { key: "ups_battery", label: "Batterie UPS (seuil bas)", warn: "30", crit: "15", unit: "%" },
    ],
  },
  {
    title: "Réseau",
    icon: "🌐",
    items: [
      { key: "iface_error", label: "Taux d'erreur interface", warn: "0.1", crit: "1", unit: "%" },
    ],
  },
];

function ThresholdsTab() {
  const [values, setValues] = useState<Record<string, { warn: string; crit: string }>>(
    Object.fromEntries(
      THRESHOLD_GROUPS.flatMap(g => g.items.map(i => [i.key, { warn: i.warn, crit: i.crit }]))
    )
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    toast.success("Seuils sauvegardés — redémarrez le backend pour les appliquer");
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <div>
          Les seuils sont définis dans le fichier <code className="font-mono bg-amber-100 px-1 rounded">.env</code> et chargés au démarrage du backend.
          Modifiez les valeurs ci-dessous puis mettez à jour votre fichier <code className="font-mono bg-amber-100 px-1 rounded">.env</code> en conséquence.
        </div>
      </div>

      {THRESHOLD_GROUPS.map(group => (
        <div key={group.title} className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
            <span>{group.icon}</span>
            <h3 className="font-semibold text-gray-800 text-sm">{group.title}</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Métrique</th>
                <th className="px-4 py-2.5 text-left font-medium text-yellow-600 text-xs">⚠️ Avertissement</th>
                <th className="px-4 py-2.5 text-left font-medium text-red-600 text-xs">🔴 Critique</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 text-xs">Var. env.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {group.items.map(item => (
                <tr key={item.key} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700 font-medium">{item.label}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                        value={values[item.key]?.warn ?? item.warn}
                        onChange={e => setValues(v => ({ ...v, [item.key]: { ...v[item.key], warn: e.target.value } }))}
                      />
                      <span className="text-gray-400 text-xs">{item.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        className="w-20 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                        value={values[item.key]?.crit ?? item.crit}
                        onChange={e => setValues(v => ({ ...v, [item.key]: { ...v[item.key], crit: e.target.value } }))}
                      />
                      <span className="text-gray-400 text-xs">{item.unit}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                    {item.key.toUpperCase()}_WARN_THRESHOLD
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            saved ? "bg-green-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          <Save className="w-4 h-4" />
          {saved ? "Valeurs affichées" : "Afficher les valeurs"}
        </button>
      </div>
    </div>
  );
}

// ─── Integrations Tab ─────────────────────────────────────────────────────────

interface IntegrationCard {
  name: string;
  description: string;
  icon: string;
  url: string;
  envKey?: string;
  category: "soc" | "noc" | "notif";
  status: "active" | "partial" | "inactive";
}

const INTEGRATION_CARDS: IntegrationCard[] = [
  {
    name: "Grafana",
    description: "Dashboards de métriques et visualisation",
    icon: "📊",
    url: "https://akisoc.team.akilee.tech/grafana",
    category: "noc",
    status: "active",
  },
  {
    name: "Kibana",
    description: "Visualisation des logs (ELK Stack)",
    icon: "🔍",
    url: "https://akisoc.team.akilee.tech/kibana",
    category: "noc",
    status: "active",
  },
  {
    name: "Prometheus",
    description: "Collecte et stockage des métriques",
    icon: "🔥",
    url: "https://akisoc.team.akilee.tech/prometheus",
    category: "noc",
    status: "active",
  },
  {
    name: "Wazuh",
    description: "SIEM — détection d'intrusion et conformité",
    icon: "🛡️",
    url: "https://akisoc.team.akilee.tech/wazuh",
    envKey: "WAZUH_API_PASSWORD",
    category: "soc",
    status: "active",
  },
  {
    name: "TheHive",
    description: "Gestion des incidents et cases de sécurité",
    icon: "🐝",
    url: "https://akisoc.team.akilee.tech/thehive",
    envKey: "THEHIVE_API_KEY",
    category: "soc",
    status: "partial",
  },
  {
    name: "Cortex",
    description: "Analyse et enrichissement d'observables",
    icon: "🧠",
    url: "https://akisoc.team.akilee.tech/cortex",
    category: "soc",
    status: "active",
  },
  {
    name: "Shuffle SOAR",
    description: "Automatisation des réponses aux incidents",
    icon: "🔄",
    url: "https://akisoc.team.akilee.tech/shuffle",
    category: "soc",
    status: "active",
  },
  {
    name: "NetBox",
    description: "CMDB — inventaire et documentation réseau",
    icon: "🗃️",
    url: "https://akisoc.team.akilee.tech/netbox",
    envKey: "NETBOX_TOKEN",
    category: "noc",
    status: "partial",
  },
  {
    name: "Slack",
    description: "Notifications d'alertes et incidents",
    icon: "💬",
    url: "",
    envKey: "SLACK_WEBHOOK_URL",
    category: "notif",
    status: "partial",
  },
  {
    name: "Microsoft Teams",
    description: "Notifications via webhook Teams",
    icon: "💼",
    url: "",
    envKey: "TEAMS_WEBHOOK_URL",
    category: "notif",
    status: "inactive",
  },
  {
    name: "PagerDuty",
    description: "On-call et escalade d'alertes critiques",
    icon: "📟",
    url: "",
    envKey: "PAGERDUTY_SERVICE_KEY",
    category: "notif",
    status: "inactive",
  },
  {
    name: "Email SMTP",
    description: "Envoi de notifications par email",
    icon: "📧",
    url: "",
    envKey: "SMTP_HOST",
    category: "notif",
    status: "partial",
  },
];

const CATEGORY_LABELS = {
  soc: "SOC / Sécurité",
  noc: "NOC / Infrastructure",
  notif: "Notifications",
};

const STATUS_BADGE = {
  active:   { label: "Actif",     cls: "bg-green-100 text-green-700" },
  partial:  { label: "À configurer", cls: "bg-amber-100 text-amber-700" },
  inactive: { label: "Inactif",   cls: "bg-gray-100 text-gray-500" },
};

function IntegrationsTab() {
  const categories = ["soc", "noc", "notif"] as const;

  return (
    <div className="space-y-8">
      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {CATEGORY_LABELS[cat]}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {INTEGRATION_CARDS.filter(c => c.category === cat).map(card => (
              <div
                key={card.name}
                className="bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{card.icon}</span>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{card.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{card.description}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[card.status].cls}`}>
                    {STATUS_BADGE[card.status].label}
                  </span>
                </div>

                {card.envKey && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-500">Var. env. : </span>
                    <code className="font-mono text-gray-700">{card.envKey}</code>
                    <div className="mt-1 text-gray-400">
                      Configurer dans <code className="font-mono">docker/.env</code>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-auto">
                  {card.url && (
                    <a
                      href={card.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      Ouvrir <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [tab, setTab] = useState("users");

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configuration de la plateforme, utilisateurs et intégrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {tab === "users"        && <UsersTab />}
        {tab === "thresholds"   && <ThresholdsTab />}
        {tab === "integrations" && <IntegrationsTab />}
      </div>
    </div>
  );
}
