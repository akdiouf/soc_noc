import React from "react";

interface StatusCount {
  status: string;
  count: number;
}

interface Props {
  statuses: StatusCount[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  up: { label: "Opérationnels", color: "bg-green-100 border-green-300 text-green-800", icon: "✓" },
  down: { label: "Hors service", color: "bg-red-100 border-red-300 text-red-800", icon: "✗" },
  warning: { label: "Avertissement", color: "bg-orange-100 border-orange-300 text-orange-800", icon: "!" },
  critical: { label: "Critique", color: "bg-red-200 border-red-400 text-red-900", icon: "!!" },
  maintenance: { label: "Maintenance", color: "bg-blue-100 border-blue-300 text-blue-800", icon: "M" },
  unknown: { label: "Inconnu", color: "bg-gray-100 border-gray-300 text-gray-600", icon: "?" },
};

export function DeviceStatusMap({ statuses }: Props) {
  const total = statuses.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex flex-wrap gap-4">
      {statuses.map(({ status, count }) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div
            key={status}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${cfg.color}`}
          >
            <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm">
              {cfg.icon}
            </div>
            <div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium">{cfg.label}</div>
              <div className="text-xs opacity-75">{pct}% du parc</div>
            </div>
          </div>
        );
      })}
      {total > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-gray-50 border-gray-200">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-sm text-gray-600">
            Σ
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-700">{total}</div>
            <div className="text-xs font-medium text-gray-500">Total</div>
          </div>
        </div>
      )}
    </div>
  );
}
