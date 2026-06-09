import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { devices as devicesApi, alerts as alertsApi } from "../../services/api";
import { StatusDot } from "../../components/common/StatusDot";
import { AlertSeverityBadge } from "../../components/common/AlertSeverityBadge";
import { Shield, Camera, AlertTriangle, Clock, User } from "lucide-react";

// Simulation d'événements de contrôle d'accès (en production, via API dédiée)
const MOCK_ACCESS_EVENTS = [
  { id: 1, time: new Date(Date.now() - 60000), type: "granted", door: "Salle Serveurs A", person: "Marie Dupont", badge: "A-1042" },
  { id: 2, time: new Date(Date.now() - 180000), type: "denied", door: "Salle Réseau", person: "Inconnu", badge: "X-INVALID" },
  { id: 3, time: new Date(Date.now() - 300000), type: "granted", door: "Datacenter Principal", person: "Jean Martin", badge: "A-2001" },
  { id: 4, time: new Date(Date.now() - 600000), type: "forced", door: "Salle Batterie", person: null, badge: null },
  { id: 5, time: new Date(Date.now() - 900000), type: "granted", door: "Salle Serveurs B", person: "Sarah K.", badge: "A-1055" },
];

export function AccessControlPage() {
  const [filter, setFilter] = useState<"all" | "granted" | "denied" | "forced">("all");

  const { data: accessDevices } = useQuery({
    queryKey: ["devices", { type: "access_control" }],
    queryFn: () => devicesApi.list({ device_type: "access_control", size: 50 }),
    refetchInterval: 30_000,
  });

  const { data: cameras } = useQuery({
    queryKey: ["devices", { type: "camera" }],
    queryFn: () => devicesApi.list({ device_type: "camera", size: 50 }),
    refetchInterval: 60_000,
  });

  const { data: accessAlerts } = useQuery({
    queryKey: ["alerts", { category: "access", status: "active" }],
    queryFn: () => alertsApi.list({ category: "access", status: "active", size: 20 }),
    refetchInterval: 15_000,
  });

  const filteredEvents = MOCK_ACCESS_EVENTS.filter(e => filter === "all" || e.type === filter);

  const EVENT_STYLE = {
    granted: { label: "Accès accordé", color: "bg-green-100 text-green-800", icon: "✅" },
    denied: { label: "Accès refusé", color: "bg-red-100 text-red-800", icon: "🚫" },
    forced: { label: "Forçage détecté", color: "bg-red-900 text-white", icon: "🚨" },
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">🔐 Contrôle d'Accès & Surveillance</h1>
        {(accessAlerts?.total || 0) > 0 && (
          <span className="bg-red-100 text-red-700 text-sm font-medium px-3 py-1 rounded-full animate-pulse">
            {accessAlerts?.total} alerte(s) sécurité
          </span>
        )}
      </div>

      {/* Alertes accès */}
      {(accessAlerts?.items || []).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Alertes contrôle d'accès actives
          </h3>
          <div className="space-y-2">
            {accessAlerts!.items.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-red-100">
                <AlertSeverityBadge severity={alert.severity} />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <div className="text-sm text-gray-500">{alert.message}</div>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(alert.last_seen).toLocaleTimeString("fr-FR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Équipements contrôle d'accès */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">
                Contrôleurs d'accès ({accessDevices?.total || 0})
              </h2>
            </div>
            <div className="divide-y">
              {(accessDevices?.items || []).map((device) => (
                <div key={device.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{device.name}</div>
                    <div className="text-xs text-gray-400">{device.room || device.datacenter || device.ip_address}</div>
                  </div>
                  <StatusDot status={device.status} />
                </div>
              ))}
              {!accessDevices?.items.length && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Aucun contrôleur configuré</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <Camera className="w-4 h-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">
                Caméras ({cameras?.total || 0})
              </h2>
            </div>
            <div className="divide-y">
              {(cameras?.items || []).map((cam) => (
                <div key={cam.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">{cam.name}</div>
                    <div className="text-xs text-gray-400">{cam.room || cam.ip_address}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={cam.status} />
                    {cam.status === "up" && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Enregistrement" />
                    )}
                  </div>
                </div>
              ))}
              {!cameras?.items.length && (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">Aucune caméra configurée</div>
              )}
            </div>
          </div>
        </div>

        {/* Journal d'accès */}
        <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Journal d'accès</h2>
            <div className="flex gap-2">
              {(["all", "granted", "denied", "forced"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    filter === f
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {f === "all" ? "Tous" : f === "granted" ? "Accordé" : f === "denied" ? "Refusé" : "Forçage"}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y">
            {filteredEvents.map((event) => {
              const style = EVENT_STYLE[event.type as keyof typeof EVENT_STYLE];
              return (
                <div key={event.id} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl mt-0.5">{style.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.color}`}>
                          {style.label}
                        </span>
                        <span className="font-medium text-gray-900">{event.door}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {event.person && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {event.person}
                          </span>
                        )}
                        {event.badge && (
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                            Badge: {event.badge}
                          </span>
                        )}
                        <span className="flex items-center gap-1 ml-auto text-xs">
                          <Clock className="w-3 h-3" />
                          {event.time.toLocaleTimeString("fr-FR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
