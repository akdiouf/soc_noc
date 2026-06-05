// ─── Enums ────────────────────────────────────────────────────────────────────
export type DeviceType =
  | "router" | "switch" | "firewall" | "load_balancer" | "access_point"
  | "server" | "hypervisor" | "virtual_machine"
  | "storage" | "nas" | "san"
  | "ups" | "pdu" | "crac" | "crah" | "generator" | "ats" | "chiller"
  | "access_control" | "camera" | "smoke_detector"
  | "printer" | "other";

export type DeviceSite = "primary" | "failover" | "both";
export type DeviceStatus = "up" | "down" | "warning" | "critical" | "unknown" | "maintenance";
export type MonitoringProtocol = "snmp_v1" | "snmp_v2c" | "snmp_v3" | "modbus_tcp" | "modbus_rtu" | "bacnet_ip" | "rest_api" | "icmp" | "ssh" | "wmi" | "ipmi";

export type AlertSeverity = "info" | "warning" | "critical" | "emergency";
export type AlertStatus = "active" | "acknowledged" | "resolved" | "suppressed";
export type AlertCategory = "availability" | "performance" | "capacity" | "configuration" | "power" | "temperature" | "humidity" | "cooling" | "access" | "security" | "intrusion" | "anomaly" | "compliance";

export type IncidentSeverity = "p1" | "p2" | "p3" | "p4" | "p5";
export type IncidentStatus = "open" | "in_progress" | "pending" | "resolved" | "closed" | "post_mortem";
export type IncidentType = "network_outage" | "server_down" | "performance_degradation" | "power_failure" | "cooling_failure" | "hardware_failure" | "capacity_issue" | "security_breach" | "intrusion_attempt" | "data_leak" | "ransomware" | "ddos" | "unauthorized_access" | "malware" | "phishing";

export type UserRole = "super_admin" | "noc_manager" | "soc_manager" | "noc_analyst" | "soc_analyst" | "read_only";

// ─── Interfaces ────────────────────────────────────────────────────────────────
export interface Device {
  id: string;
  name: string;
  hostname?: string;
  ip_address: string;
  mac_address?: string;
  device_type: DeviceType;
  site: DeviceSite;
  status: DeviceStatus;
  vendor?: string;
  model?: string;
  serial_number?: string;
  firmware_version?: string;
  os_version?: string;
  datacenter?: string;
  room?: string;
  rack?: string;
  rack_unit?: number;
  monitoring_protocol: MonitoringProtocol;
  poll_interval: number;
  is_monitored: boolean;
  is_critical: boolean;
  description?: string;
  tags: string[];
  last_seen?: string;
  last_poll?: string;
  created_at: string;
  updated_at?: string;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  category: AlertCategory;
  device_id?: string;
  source_ip?: string;
  source_name?: string;
  metric_name?: string;
  metric_value?: number;
  metric_unit?: string;
  threshold_value?: number;
  correlation_id?: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  acknowledged_at?: string;
  resolved_at?: string;
  resolution_note?: string;
  notification_sent: boolean;
  tags: string[];
}

export interface IncidentTimeline {
  id: string;
  event_type: string;
  message: string;
  author_name?: string;
  created_at: string;
}

export interface Incident {
  id: string;
  ticket_number: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  incident_type?: IncidentType;
  impacted_services: string[];
  impacted_sites: string[];
  impact_description?: string;
  affected_users_count: number;
  team?: string;
  escalated: boolean;
  escalated_to?: string;
  escalation_reason?: string;
  detected_at: string;
  started_at?: string;
  resolved_at?: string;
  mttr_minutes?: number;
  root_cause?: string;
  resolution_steps?: string;
  lessons_learned?: string;
  preventive_actions: string[];
  thehive_case_id?: string;
  tags: string[];
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  on_call: boolean;
  phone?: string;
  last_login?: string;
  created_at: string;
}

export interface MetricPoint {
  timestamp: string;
  value: number;
  field: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ─── Threat Intelligence (MISP) ───────────────────────────────────────────────
export type IOCType =
  | "ip-dst" | "ip-src" | "domain" | "hostname" | "url"
  | "md5" | "sha1" | "sha256" | "sha512"
  | "email-src" | "email-dst" | "filename"
  | "mutex" | "regkey" | "user-agent" | "ip-dst|port" | "other";

export interface IOC {
  id: string;
  value: string;
  ioc_type: IOCType;
  misp_event_id: number;
  misp_event_uuid: string;
  misp_event_title?: string;
  misp_org?: string;
  threat_level: number;          // 1=High 2=Medium 3=Low 4=Undefined
  tlp: "white" | "green" | "amber" | "red";
  category?: string;
  comment?: string;
  tags: string[];
  to_ids: boolean;
  misp_timestamp?: string;
  first_seen: string;
  last_seen: string;
  synced_at: string;
  hit_count: number;
}

export interface IOCLookupResponse {
  value: string;
  found: boolean;
  threat_level?: number;
  iocs: IOC[];
}

export interface MISPStatus {
  connected: boolean;
  url: string;
  version?: string;
  organization?: string;
  error?: string;
}

export interface IOCStats {
  total: number;
  by_type: Record<string, number>;
  by_threat_level: Record<string, number>;
  by_tlp: Record<string, number>;
  last_sync?: string;
}

export interface MISPEvent {
  event_id: number;
  uuid: string;
  title: string;
  org?: string;
  threat_level: number;
  attribute_count: number;
  tags: string[];
  date?: string;
}
