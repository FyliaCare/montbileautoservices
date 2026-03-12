import type { AppUser } from "./types";

// ─── User Accounts ───
export const USERS: AppUser[] = [
  {
    id: "rider-1",
    name: "Rider Account",
    role: "rider",
    pin: "202603",
    icon: "🏍️",
  },
  {
    id: "owner-1",
    name: "Management",
    role: "owner",
    pin: "300301",
    icon: "👔",
  },
];

// ─── Business Defaults ───
export const DEFAULTS = {
  fare: 3,
  pax: 4,
  trips: 20,
  wage: 15,
  dailyTarget: 375,
  riderDailyPay: 50,
  riderMonthlySalary: 500,
  fleet: 1,
} as const;

// ─── Expense Categories ───
export const EXPENSE_CATEGORIES = [
  "Fuel",
  "Rider Wages",
  "Maintenance",
  "Insurance",
  "Permits/Licence",
  "Union Dues",
  "Phone/Airtime",
  "Tracker Subscription",
  "Miscellaneous",
] as const;

// ─── Service Types ───
export const SERVICE_TYPES = [
  "Oil Change",
  "Tyre Replacement",
  "Engine Repair",
  "Brake Service",
  "Electrical",
  "Body Repair",
  "Chain/Sprocket",
  "General Service",
  "Other",
] as const;

// ─── Shift Schedule ───
export const SHIFT_START_HOUR = 6;  // 6 AM — earliest shift start
export const SHIFT_END_HOUR = 19;   // 7 PM — after this = overtime

// ─── Base Station (Geofence) ───
export const BASE_LOCATION = { lat: 4.9511412, lng: -1.7909565 } as const;
export const GEOFENCE_RADIUS_M = 150; // metres — rider must be within this to start/end shift

// ─── Currency ───
export const CURRENCY = {
  code: "GHS",
  symbol: "GH₵",
  locale: "en-GH",
} as const;

// ─── Notification Icons ───
export const NOTIFICATION_ICONS: Record<string, string> = {
  shift_started: "🟢",
  shift_ended: "🔴",
  trip_logged: "🛺",
  daily_target_reached: "🎯",
  expense_added: "💸",
  payment_recorded: "💰",
  daily_log_submitted: "📋",
  rider_added: "👤",
  rider_updated: "✏️",
  fuel_logged: "⛽",
  maintenance_logged: "🔧",
  settings_updated: "⚙️",
  milestone_reached: "🏆",
  remittance_submitted: "💵",
  remittance_confirmed: "✅",
  checklist_failed: "⚠️",
  leave_requested: "📅",
  leave_approved: "✅",
  leave_rejected: "❌",
  incident_reported: "🚨",
  incident_resolved: "✅",
  message_received: "💬",
  document_expiring: "📄",
  maintenance_due: "🔧",
  system: "📢",
};

// ─── Achievement Badges ───
export const ACHIEVEMENT_BADGES = [
  { id: "early_bird", name: "Early Bird", icon: "🌅", description: "Start shift before 6 AM for 5 days" },
  { id: "iron_horse", name: "Iron Horse", icon: "🐴", description: "Work 30 days straight" },
  { id: "century_rider", name: "Century Rider", icon: "💯", description: "Complete 100 trips in one week" },
  { id: "clean_machine", name: "Clean Machine", icon: "✨", description: "Pass all checklist items for 14 days" },
  { id: "fuel_saver", name: "Fuel Saver", icon: "⛽", description: "Lowest fuel cost for a month" },
  { id: "top_earner", name: "Top Earner", icon: "🏆", description: "Earn the most in a week" },
  { id: "zero_balance", name: "Zero Balance", icon: "💚", description: "All remittances paid in full" },
  { id: "speed_logger", name: "Speed Logger", icon: "⚡", description: "Log a trip in under 10 seconds" },
] as const;

// ─── Incident Types ───
export const INCIDENT_TYPES = [
  { value: "accident", label: "Accident" },
  { value: "breakdown", label: "Breakdown" },
  { value: "theft", label: "Theft" },
  { value: "police", label: "Police Stop" },
  { value: "other", label: "Other" },
] as const;
