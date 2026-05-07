import React from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard, Server, AlertTriangle, FileText,
  Activity, Shield, Settings, Network, Thermometer,
  Zap, LogOut, Bell
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
    ],
  },
  {
    section: "Admin",
    items: [
      { to: "/settings", icon: Settings, label: "Paramètres" },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-64 bg-gray-900 text-gray-100 min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="text-xl font-bold text-white">SOC/NOC Platform</div>
        <div className="text-xs text-gray-400 mt-0.5">Datacenter Manager</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
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
