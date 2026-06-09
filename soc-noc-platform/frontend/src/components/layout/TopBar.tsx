import React from "react";
import { useQuery } from "@tanstack/react-query";
import { alerts as alertsApi, auth } from "../../services/api";
import { useAlertStore } from "../../store/alertStore";
import { Bell, User } from "lucide-react";

export function TopBar() {
  const { unreadCount, markAllRead } = useAlertStore();

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: auth.me,
    staleTime: Infinity,
  });

  const { data: counts } = useQuery({
    queryKey: ["alerts", "count"],
    queryFn: alertsApi.activeCount,
    refetchInterval: 15_000,
  });

  const totalActive = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const badge = unreadCount + totalActive;

  return (
    <header className="h-14 bg-white border-b px-6 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        {/* Status des sites */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Datacenter Principal
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Site de Repli
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Cloche alertes */}
        <button
          onClick={markAllRead}
          className="relative p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <Bell className="w-5 h-5" />
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </button>

        {/* Utilisateur */}
        <div className="flex items-center gap-2 pl-3 border-l">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm">
            <div className="font-medium text-gray-900">{user?.full_name || user?.username || "—"}</div>
            <div className="text-xs text-gray-400">{user?.role?.replace("_", " ") || ""}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
