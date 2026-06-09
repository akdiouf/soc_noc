import React from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { Alert } from "../../types";
import { AlertSeverityBadge } from "../common/AlertSeverityBadge";

interface Props {
  alerts: Alert[];
}

const CATEGORY_ICON: Record<string, string> = {
  availability: "📡",
  performance: "📊",
  capacity: "💾",
  power: "⚡",
  temperature: "🌡️",
  humidity: "💧",
  cooling: "❄️",
  access: "🔐",
  security: "🛡️",
  intrusion: "🚨",
  anomaly: "⚠️",
  compliance: "📋",
};

export function AlertFeed({ alerts }: Props) {
  if (!alerts.length) {
    return (
      <div className="px-6 py-12 text-center text-gray-400">
        <div className="text-4xl mb-2">✅</div>
        <div className="text-sm">Aucune alerte active</div>
      </div>
    );
  }

  return (
    <div className="divide-y max-h-96 overflow-y-auto">
      {alerts.map((alert) => (
        <div key={alert.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-xl">
              {CATEGORY_ICON[alert.category] || "⚠️"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertSeverityBadge severity={alert.severity} />
                {alert.occurrence_count > 1 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    ×{alert.occurrence_count}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(alert.last_seen), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
              </div>
              <div className="text-sm font-medium text-gray-900 mt-1 truncate">
                {alert.title}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {alert.source_name || alert.source_ip || "—"}
                {alert.metric_value !== undefined && alert.metric_name && (
                  <span className="ml-2 text-gray-400">
                    {alert.metric_name}: <strong>{alert.metric_value}</strong>
                    {alert.metric_unit || ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
