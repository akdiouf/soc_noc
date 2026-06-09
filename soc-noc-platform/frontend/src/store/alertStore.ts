import { create } from "zustand";
import type { Alert } from "../types";

interface AlertStore {
  liveAlerts: Alert[];
  unreadCount: number;
  pushAlert: (alert: Alert) => void;
  markAllRead: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  liveAlerts: [],
  unreadCount: 0,
  pushAlert: (alert) =>
    set((state) => ({
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    })),
  markAllRead: () => set({ unreadCount: 0 }),
}));
