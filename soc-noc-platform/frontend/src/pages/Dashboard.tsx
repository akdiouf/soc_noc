import React from "react";
import { useQuery } from "@tanstack/react-query";
import { alerts, devices, incidents, metrics } from "../services/api";
import { AlertSeverityBadge } from "../components/common/AlertSeverityBadge";
import { StatusDot } from "../components/common/StatusDot";
import { MetricCard } from "../components/noc/MetricCard";
import { AlertFeed } from "../components/noc/AlertFeed";
import { DeviceStatusMap } from "../components/noc/DeviceStatusMap";
import type { Alert } from "../types";

export function Dashboard() {
  const { data: alertCounts } = useQuery({
    queryKey: ["alerts", "count"],
    queryFn: alerts.activeCount,
    refetchInterval: 15_000,
  });

  const { data: overview } = useQuery({
    queryKey: ["metrics", "overview"],
    queryFn: () => metrics.overview(),
    refetchInterval: 30_000,
  });

  const { data: deviceStatusSummary } = useQuery({
    queryKey: ["devices", "by-status"],
    queryFn: () => devices.byStatus(),
    refetchInterval: 30_000,
  });

  const { data: activeAlerts } = useQuery({
    queryKey: ["alerts", "active", "list"],
    queryFn: () => alerts.list({ status: "active", size: 10 }),
    refetchInterval: 15_000,
  });

  const { data: openIncidents } = useQuery({
    queryKey: ["incidents", "open"],
    queryFn: () => incidents.list({ status: "open", size: 5 }),
    refetchInterval: 30_000,
  });

  const totalAlerts = alertCounts
    ? Object.values(alertCounts).reduce((a, b) => a + b, 0)
    : 0;

  const downDevices = deviceStatusSummary?.find((d: any) => d.status === "down")?.count || 0;
  const criticalDevices = deviceStatusSummary?.find((d: any) => d.status === "critical")?.count || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard NOC/SOC</h1>
          <p className="text-sm text-gray-500">
            Dernière mise à jour: {new Date().toLocaleTimeString("fr-FR")}
          </p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full font-medium">
            Datacenter Principal
          </span>
          <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full font-medium">
            Site de Repli
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Alertes actives"
          value={totalAlerts}
          color={totalAlerts > 0 ? "red" : "green"}
          subtitle={`${alertCounts?.emergency || 0} urgentes`}
        />
        <MetricCard
          label="Équipements DOWN"
          value={downDevices + criticalDevices}
          color={downDevices > 0 ? "red" : "green"}
          subtitle={`${criticalDevices} en état critique`}
        />
        <MetricCard
          label="Incidents ouverts"
          value={openIncidents?.total || 0}
          color={(openIncidents?.total || 0) > 0 ? "orange" : "green"}
          subtitle="P1/P2 en cours"
        />
        <MetricCard
          label="CPU moyen"
          value={`${overview?.cpu_percent || 0}%`}
          color={(overview?.cpu_percent || 0) > 80 ? "orange" : "green"}
          subtitle={`RAM: ${overview?.memory_percent || 0}%`}
        />
      </div>

      {/* Alert severity breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {(["emergency", "critical", "warning", "info"] as const).map((sev) => (
          <div
            key={sev}
            className="bg-white rounded-lg border p-4 text-center shadow-sm"
          >
            <AlertSeverityBadge severity={sev} large />
            <div className="text-3xl font-bold mt-2">
              {alertCounts?.[sev] || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1 capitalize">{sev}</div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alert feed */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Alertes récentes</h2>
              <a href="/alerts" className="text-sm text-blue-600 hover:underline">
                Voir tout →
              </a>
            </div>
            <AlertFeed alerts={activeAlerts?.items || []} />
          </div>
        </div>

        {/* Incidents ouverts */}
        <div>
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Incidents</h2>
              <a href="/incidents" className="text-sm text-blue-600 hover:underline">
                Voir tout →
              </a>
            </div>
            <div className="divide-y">
              {(openIncidents?.items || []).map((inc) => (
                <div key={inc.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 px-2 py-0.5 text-xs font-bold rounded ${
                        inc.severity === "p1"
                          ? "bg-red-100 text-red-800"
                          : inc.severity === "p2"
                          ? "bg-orange-100 text-orange-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {inc.severity.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {inc.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {inc.ticket_number} • {inc.team || "NOC"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!openIncidents?.items.length && (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  Aucun incident ouvert
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Topologie / carte des équipements */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Statut des équipements par salle</h2>
        </div>
        <div className="p-6">
          <DeviceStatusMap statuses={deviceStatusSummary || []} />
        </div>
      </div>
    </div>
  );
}
