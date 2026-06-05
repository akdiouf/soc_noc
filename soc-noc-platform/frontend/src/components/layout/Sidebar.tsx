import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard, Server, AlertTriangle, FileText,
  Activity, Shield, Settings, Network, Thermometer,
  Zap, LogOut, Bell, ShieldAlert, ExternalLink,
  ChevronDown, ChevronRight, BarChart2, Search,
  BookOpen, GitBranch, Database, Layers, Radio,
} from "lucide-react";

const NAV_ITEMS = [
  {
    section: "NOC",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/devices", icon: Server, label: "Équipements" },
      { to: "/alerts", icon: AlertTriangle, label: "Alertes" },
      { to: "/incidents", icon: FileText, label: "Incidents" },
      { to: "/metrics", icon: Activity, label: "Métriques" },
      { to: "/topology", icon: Network, label: "Topologie" },
    ],
  },
  {
    section: "Physique",
    items: [
      { to: "/physical/power", icon: Zap, label: "Alimentation" },
      { to: "/physical/cooling", icon: Thermometer, label: "Climatisation" },
      { to: "/physical/access", icon: Shield, label: "Contrôle accès" },
    ],
  },
  {
    section: "SOC",
    items: [
      { to: "/soc/events", icon: Bell, label: "Événements" },
      { to: "/soc/incidents", icon: Shield, label: "Incidents sécu." },
      { to: "/soc/threat-intel", icon: ShieldAlert, label: "Threat Intel" },
    ],
  },
  {
    section: "Admin",
    items: [
      { to: "/settings", icon: Settings, label: "Paramètres" },
    ],
  },
];

// Liens vers les outils externes de la stack
const PLATFORM_GROUPS = [
  {
    group: "Supervision",
    color: "text-blue-400",
    tools: [
      { label: "Grafana", href: "http://localhost:8090/grafana/", icon: BarChart2, desc: "Dashboards" },
      { label: "Prometheus", href: "http://localhost:8090/prometheus/", icon: Radio, desc: "Métriques" },
      { label: "Alertmanager", href: "http://localhost:8090/alerts/", icon: Bell, desc: "Alertes" },
      { label: "Kibana", href: "http://localhost:8090/kibana", icon: Search, desc: "Logs ELK" },
    ],
  },
  {
    group: "SOC",
    color: "text-red-400",
    tools: [
      { label: "Wazuh", href: "http://localhost:8090/wazuh", icon: ShieldAlert, desc: "SIEM / EDR" },
      { label: "TheHive", href: "http://localhost:8090/thehive", icon: BookOpen, desc: "Incidents IR" },
      { label: "Cortex", href: "http://localhost:8090/cortex", icon: Layers, desc: "Enrichissement" },
      { label: "MISP", href: "http://localhost:8081", icon: Shield, desc: "Threat Intel" },
      { label: "Shuffle", href: "http://localhost:3002", icon: GitBranch, desc: "SOAR" },
    ],
  },
  {
    group: "Infrastructure",
    color: "text-green-400",
    tools: [
      { label: "NetBox", href: "http://localhost:8090/netbox", icon: Database, desc: "CMDB" },
    ],
  },
];

export function Sidebar() {
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Supervision: true,
    SOC: true,
    Infrastructure: true,
  });

  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));

  return (
    <aside className="flex flex-col w-64 bg-gray-900 text-gray-100 min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="text-xl font-bold text-white">SOC/NOC Platform</div>
        <div className="text-xs text-gray-400 mt-0.5">Datacenter Manager</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">

        {/* Internal pages */}
        {NAV_ITEMS.map((group) => (
          <div key={group.section}>
            <div className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                    )
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {/* ── Plateformes (dropdown externe) ────────────────────────────── */}
        <div>
          <button
            onClick={() => setPlatformsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-3">
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              Plateformes
            </span>
            {platformsOpen
              ? <ChevronDown className="w-4 h-4 text-gray-500" />
              : <ChevronRight className="w-4 h-4 text-gray-500" />}
          </button>

          {platformsOpen && (
            <div className="mt-1 ml-2 space-y-3 border-l border-gray-700 pl-3">
              {PLATFORM_GROUPS.map(({ group, color, tools }) => (
                <div key={group}>
                  {/* Sub-group header */}
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between py-1 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-400"
                  >
                    <span className={color}>{group}</span>
                    {openGroups[group]
                      ? <ChevronDown className="w-3 h-3" />
                      : <ChevronRight className="w-3 h-3" />}
                  </button>

                  {openGroups[group] && (
                    <div className="space-y-0.5 mt-1">
                      {tools.map(({ label, href, icon: Icon, desc }) => (
                        <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={desc}
                          className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors group"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{label}</span>
                            <span className="text-xs text-gray-600 group-hover:text-gray-400 truncate hidden xl:block">
                              {desc}
                            </span>
                          </span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-60" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={() => {
            localStorage.removeItem("access_token");
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
