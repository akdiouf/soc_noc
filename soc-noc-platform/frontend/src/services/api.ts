import axios, { AxiosInstance } from "axios";
import type {
  Device, Alert, Incident, IncidentTimeline, User, MetricPoint, PaginatedResponse,
  AlertSeverity, AlertStatus, AlertCategory,
  DeviceType, DeviceSite, DeviceStatus,
  IOC, IOCType, IOCLookupResponse, MISPStatus, IOCStats, MISPEvent,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Injecter le token JWT
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Gérer l'expiration du token
http.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  login: async (username: string, password: string) => {
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    const { data } = await http.post("/auth/login", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    localStorage.setItem("access_token", data.access_token);
    return data;
  },
  me: async (): Promise<User> => (await http.get("/auth/me")).data,
  logout: () => localStorage.removeItem("access_token"),
};

// ─── Devices ─────────────────────────────────────────────────────────────────
export const devices = {
  list: async (params?: {
    site?: DeviceSite;
    device_type?: DeviceType;
    status?: DeviceStatus;
    search?: string;
    page?: number;
    size?: number;
  }): Promise<PaginatedResponse<Device>> =>
    (await http.get("/devices", { params })).data,

  get: async (id: string): Promise<Device> =>
    (await http.get(`/devices/${id}`)).data,

  create: async (payload: Partial<Device>): Promise<Device> =>
    (await http.post("/devices", payload)).data,

  update: async (id: string, payload: Partial<Device>): Promise<Device> =>
    (await http.put(`/devices/${id}`, payload)).data,

  delete: async (id: string) => http.delete(`/devices/${id}`),

  toggleMaintenance: async (id: string, enable: boolean): Promise<Device> =>
    (await http.post(`/devices/${id}/maintenance`, null, { params: { enable } })).data,

  byType: async (site?: DeviceSite) =>
    (await http.get("/devices/summary/by-type", { params: { site } })).data,

  byStatus: async (site?: DeviceSite) =>
    (await http.get("/devices/summary/by-status", { params: { site } })).data,
};

// ─── Alerts ──────────────────────────────────────────────────────────────────
export const alerts = {
  list: async (params?: {
    severity?: AlertSeverity;
    status?: AlertStatus;
    category?: AlertCategory;
    device_id?: string;
    page?: number;
    size?: number;
  }): Promise<PaginatedResponse<Alert>> =>
    (await http.get("/alerts", { params })).data,

  get: async (id: string): Promise<Alert> =>
    (await http.get(`/alerts/${id}`)).data,

  activeCount: async (): Promise<Record<AlertSeverity, number>> =>
    (await http.get("/alerts/active/count")).data,

  acknowledge: async (id: string, note?: string): Promise<Alert> =>
    (await http.post(`/alerts/${id}/acknowledge`, { note: note || "" })).data,

  resolve: async (id: string, note?: string): Promise<Alert> =>
    (await http.post(`/alerts/${id}/resolve`, { note: note || "" })).data,

  bulkAcknowledge: async (ids: string[]) =>
    (await http.post("/alerts/bulk/acknowledge", ids)).data,
};

// ─── Incidents ───────────────────────────────────────────────────────────────
export const incidents = {
  list: async (params?: {
    severity?: string;
    status?: string;
    page?: number;
    size?: number;
  }): Promise<PaginatedResponse<Incident>> =>
    (await http.get("/incidents", { params })).data,

  get: async (id: string): Promise<Incident> =>
    (await http.get(`/incidents/${id}`)).data,

  create: async (payload: Partial<Incident>): Promise<Incident> =>
    (await http.post("/incidents", payload)).data,

  update: async (id: string, payload: Partial<Incident>): Promise<Incident> =>
    (await http.put(`/incidents/${id}`, payload)).data,

  getTimeline: async (id: string): Promise<IncidentTimeline[]> =>
    (await http.get(`/incidents/${id}/timeline`)).data,

  addTimeline: async (id: string, event_type: string, message: string) =>
    (await http.post(`/incidents/${id}/timeline`, { event_type, message })).data,

  mttrStats: async (days?: number) =>
    (await http.get("/incidents/stats/mttr", { params: { days } })).data,

  pushToTheHive: async (id: string): Promise<Incident> =>
    (await http.post(`/incidents/${id}/thehive`)).data,
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = {
  list: async (): Promise<User[]> =>
    (await http.get("/auth/users")).data,

  create: async (payload: {
    email: string; username: string; full_name?: string;
    password: string; role: User["role"]; phone?: string;
  }): Promise<User> =>
    (await http.post("/auth/users", payload)).data,

  update: async (id: string, payload: Partial<{
    full_name: string; role: User["role"]; phone: string;
    is_active: boolean; on_call: boolean; password: string;
  }>): Promise<User> =>
    (await http.patch(`/auth/users/${id}`, payload)).data,

  delete: async (id: string): Promise<void> =>
    void (await http.delete(`/auth/users/${id}`)),
};

// ─── Threat Intelligence ─────────────────────────────────────────────────────
export const threatIntel = {
  status: async (): Promise<MISPStatus> =>
    (await http.get("/threat-intel/status")).data,

  stats: async (): Promise<IOCStats> =>
    (await http.get("/threat-intel/iocs/stats")).data,

  listIOCs: async (params?: {
    ioc_type?: IOCType;
    threat_level?: number;
    tlp?: string;
    search?: string;
    page?: number;
    size?: number;
  }): Promise<PaginatedResponse<IOC>> =>
    (await http.get("/threat-intel/iocs", { params })).data,

  lookup: async (value: string, ioc_type?: IOCType): Promise<IOCLookupResponse> =>
    (await http.post("/threat-intel/iocs/lookup", { value, ioc_type })).data,

  events: async (days = 7): Promise<MISPEvent[]> =>
    (await http.get("/threat-intel/events", { params: { days } })).data,

  triggerSync: async () =>
    (await http.post("/threat-intel/sync")).data,
};

// ─── Metrics ─────────────────────────────────────────────────────────────────
export const metrics = {
  device: async (
    deviceId: string,
    metric: string,
    hours = 24,
    aggregation = "mean",
    window = "5m"
  ): Promise<MetricPoint[]> =>
    (await http.get(`/metrics/device/${deviceId}`, {
      params: { metric, hours, aggregation, window },
    })).data,

  stats: async (deviceId: string, metric: string, hours = 24) =>
    (await http.get(`/metrics/device/${deviceId}/stats`, {
      params: { metric, hours },
    })).data,

  current: async (deviceId: string, metric: string) =>
    (await http.get(`/metrics/device/${deviceId}/current`, {
      params: { metric },
    })).data,

  overview: async (site?: string) =>
    (await http.get("/metrics/dashboard/overview", { params: { site } })).data,
};
