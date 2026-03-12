// ─── Firebase Data Types ───
// These match the exact Firebase Realtime Database structure

export interface Settings {
  fleet: number;
  bike_cost: number;
  transport: number;
  dvla: number;
  veh_reg: number;
  tracker: number;
  ins_setup: number;
  permit_setup: number;
  misc_start: number;
  fare: number;
  pax: number;
  trips: number;
  extra: number;
  wdays: number;
  dist: number;
  fuel_rate: number;
  fuel_price: number;
  wage: number;
  bonus: number;
  maint_m: number;
  ins_m: number;
  permit_m: number;
  tracker_m: number;
  phone_m: number;
  union_m: number;
  misc_m: number;
  remit_d: number;
  total_paid: number;
  [key: string]: number;
}

export interface DailyLog {
  date: string;
  bike: number;
  rider: string;
  trips: number;
  passengers: number;
  fare?: number;
  fare_revenue: number;
  extra_income: number;
  total_revenue: number;
  fuel_cost: number;
  notes: string;
}

export interface Expense {
  date: string;
  category: string;
  amount: number;
  description: string;
  payment_method: string;
  recorded_by: string;
}

export interface Payment {
  date: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  recorded_by: string;
}

export interface Rider {
  name: string;
  phone: string;
  licence: string;
  bike: number;
  daily_wage: number;
  start_date: string;
  status: string;
  // Ghana Card registration fields
  ghana_card_number?: string;
  date_of_birth?: string;
  gender?: string;
  hometown?: string;
  region?: string;
  pin?: string;
  registered_at?: string;
  registration_status?: "pending" | "approved" | "active" | "suspended";
  selfRegistered?: boolean;
}

export interface FuelLog {
  date: string;
  litres: number;
  cost: number;
  odometer: number;
  notes: string;
}

export interface Maintenance {
  date: string;
  bike: number;
  service_type: string;
  description: string;
  parts_cost: number;
  labour_cost: number;
  total_cost: number;
  mechanic: string;
  notes: string;
}

export interface Shift {
  rider_id: string;
  tricycle_id: string;
  clock_in_time: string;
  clock_out_time?: string;
  status: "active" | "completed";
  total_trips: number;
  total_earnings: number;
  total_expenses: number;
  overtime_ms?: number;
  checklist?: VehicleChecklist;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  shift_id: string;
  rider_id: string;
  tricycle_id: string;
  fare_amount: number;
  trip_time: string;
  entry_method: string;
  created_at: string;
}

export interface TrackerData {
  gps_time: string;
  heart_time: string;
  speed_kmh: number;
  alarm: number;
  signal: number;
  device_type: string;
  imei: string;
  online: boolean;
  movement: "moving" | "stationary" | "idle";
  heading_computed: number;
  heading_compass: string;
  heartbeat_age_sec: number;
  speed_history: number[];
  trail: Array<{ lat: number; lng: number; speed: number; t: string }>;
  poll_count: number;
  daemon_uptime_sec: number;
}

export interface RiderLocation {
  rider_id: string;
  rider_name: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
  shift_id: string;
  status: "active" | "idle";
  source?: "phone" | "tracker";
  tracker_data?: TrackerData;
}

export interface Remittance {
  rider_id: string;
  rider_name: string;
  tricycle_id: string;
  shift_id?: string;
  amount: number;
  expected_amount?: number;
  payment_method: string;
  status: "pending" | "confirmed" | "disputed";
  confirmed_by?: string;
  confirmed_at?: string;
  notes?: string;
  remittance_date: string;
  created_at: string;
}

export interface VehicleChecklist {
  engine: boolean;
  brakes: boolean;
  lights_horn: boolean;
  tires: boolean;
  fuel_level: boolean;
  completed_at: string;
  all_passed: boolean;
}

// ─── Leave Request ───
export interface LeaveRequest {
  rider_id: string;
  rider_name: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// ─── Incident Report ───
export interface IncidentReport {
  rider_id: string;
  rider_name: string;
  tricycle_id: string;
  incident_type: "accident" | "breakdown" | "theft" | "police" | "other";
  severity: "low" | "medium" | "high";
  description: string;
  location?: string;
  status: "reported" | "investigating" | "resolved";
  cost?: number;
  resolved_at?: string;
  created_at: string;
}

// ─── Message ───
export interface Message {
  sender_id: string;
  sender_name: string;
  sender_role: "rider" | "owner";
  recipient_id?: string; // null = broadcast
  recipient_name?: string;
  content: string;
  priority: "normal" | "important" | "urgent";
  read_by: Record<string, boolean>;
  created_at: string;
}

// ─── GPS Tracker ───
export interface TrackerDevice {
  imei: string;
  name: string;
  rider_id?: string;
  rider_name?: string;
  enabled: boolean;
  last_lat?: number;
  last_lng?: number;
  last_speed?: number;
  last_seen?: string;
  added_at: string;
}

export interface TrackerConfig {
  platform: "dagps";
  account: string;
  password: string;
  server_url: string;
  devices: Record<string, TrackerDevice>;
  enabled: boolean;
  poll_interval_seconds: number;
  last_poll?: string;
  last_error?: string;
  session_token?: string;
  session_expiry?: string;
}

// ─── Document ───
export interface Document {
  name: string;
  category: "registration" | "insurance" | "roadworthy" | "permit" | "invoice" | "other";
  tricycle_id?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
}

export type NotificationType =
  | "shift_started"
  | "shift_ended"
  | "trip_logged"
  | "daily_target_reached"
  | "expense_added"
  | "payment_recorded"
  | "daily_log_submitted"
  | "rider_added"
  | "rider_updated"
  | "fuel_logged"
  | "maintenance_logged"
  | "settings_updated"
  | "milestone_reached"
  | "remittance_submitted"
  | "remittance_confirmed"
  | "checklist_failed"
  | "leave_requested"
  | "leave_approved"
  | "leave_rejected"
  | "incident_reported"
  | "incident_resolved"
  | "message_received"
  | "document_expiring"
  | "maintenance_due"
  | "rider_online"
  | "rider_offline"
  | "system";

export interface AppNotification {
  type: NotificationType;
  title: string;
  message: string;
  icon: string;
  target_role: "rider" | "management" | "all";
  actor?: string;
  read: boolean;
  data?: Record<string, string | number>;
  created_at: string;
}

// All data from Firebase
export interface FirebaseSnapshot {
  settings: Settings | null;
  daily_logs: Record<string, DailyLog>;
  expenses: Record<string, Expense>;
  payments: Record<string, Payment>;
  riders: Record<string, Rider>;
  fuel_logs: Record<string, FuelLog>;
  maintenance: Record<string, Maintenance>;
  app_shifts: Record<string, Shift>;
  app_trips: Record<string, Trip>;
  app_remittances: Record<string, Remittance>;
  app_notifications: Record<string, AppNotification>;
  rider_locations: Record<string, RiderLocation>;
  leave_requests: Record<string, LeaveRequest>;
  incidents: Record<string, IncidentReport>;
  messages: Record<string, Message>;
  documents: Record<string, Document>;
  tracker_config: TrackerConfig | null;
}

// ─── App Types ───

export type UserRole = "rider" | "owner";

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  icon: string;
}

// Keyed record helper
export type Keyed<T> = T & { id: string };
