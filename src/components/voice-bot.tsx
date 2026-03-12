"use client";

/**
 * Hey Monty — Advanced Intelligent Voice Assistant for Montbile Auto Services.
 * 60+ commands for riders and management. Conversation memory,
 * context-aware follow-ups, smart briefings, and chat UI.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useShiftStore } from "@/stores/shift-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { DEFAULTS, SHIFT_START_HOUR, SHIFT_END_HOUR } from "@/lib/constants";
import { formatCurrency, todayISO } from "@/lib/utils";
import { saveNotification } from "@/lib/firebase";
import { startLocationTracking, stopLocationTracking, clearLocationFromMap, checkAtBase } from "@/lib/location";
import { Mic, MicOff, Volume2, Loader2, X, MessageCircle, Zap, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  isVoiceSupported,
  startRecognition,
  speak,
  stopSpeaking,
  preloadVoices,
} from "@/lib/voice-engine";

// ─── Types ───
type BotState = "idle" | "listening" | "processing" | "speaking";
type CmdResult = { text: string; action?: () => Promise<void> };
type ChatMsg = { role: "user" | "monty"; text: string; ts: number };

// ─── Helpers ───
function speakAmount(n: number): string {
  const r = Math.round(n * 100) / 100;
  const c = Math.floor(r);
  const p = Math.round((r - c) * 100);
  return p > 0 ? `${c} cedis ${p} pesewas` : `${c} cedis`;
}

function extractNumber(text: string): number | null {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:cedis?|cedi|ghana|gh)/i,
    /(?:for|of|amount|spend|spent|cost|price)\s+(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function extractPassengers(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:passenger|pax|people|person)/i);
  return m ? parseInt(m[1]) : null;
}

function shortDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} hour${h !== 1 ? "s" : ""} and ${m} minute${m !== 1 ? "s" : ""}`;
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function weekDatesISO(): string[] {
  const now = new Date();
  const dow = now.getDay();
  const monOff = dow === 0 ? -6 : 1 - dow;
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + monOff + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ─── Content Banks ───
const MOTIVATIONAL = [
  "Every trip is a step closer to your goal. Keep pushing!",
  "You're doing great! Consistency beats everything.",
  "Champions don't quit. You're on the road to success!",
  "Hard work always pays off. Keep going, champ!",
  "The road to greatness is paved one trip at a time.",
  "Stay focused, stay humble, stay hungry!",
  "You're not just driving — you're building your future.",
  "Discipline today, reward tomorrow. Let's go!",
];

const SAFETY_TIPS = [
  "Always check your brakes and lights before each trip.",
  "Keep a safe following distance, especially in traffic.",
  "Wear your helmet at all times — safety first!",
  "Watch out for pedestrians, especially near schools and markets.",
  "Never use your phone while driving. Pull over if needed.",
  "Check your tire pressure regularly for a smooth, safe ride.",
  "Stay hydrated! Dehydration affects your reaction time.",
  "Slow down in rainy weather — wet roads are slippery.",
  "Always signal before turning. Let others know your intentions.",
  "Take short breaks every 2 hours to stay alert.",
];

const JOKES = [
  "Why did the tricycle go to the doctor? Because it was feeling three-tired!",
  "What do you call a sleeping tricycle? A nap-mobile!",
  "Why don't tricycles ever get lost? They always know the right route!",
  "What's a rider's favourite music? Heavy metal... on the road!",
  "Why was the tricycle so good at maths? It could always count its trips!",
];

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Command Patterns ───
interface CmdDef {
  id: string;
  patterns: RegExp[];
  roles: string[];
  desc: string;
  category: string;
}

const COMMANDS: CmdDef[] = [
  // ══════════════════════════ UNIVERSAL ══════════════════════════
  { id: "help", patterns: [/\b(help|what can you do|commands?|options?|what do you do|menu)\b/i], roles: ["rider", "management", "owner"], desc: "List commands", category: "General" },
  { id: "greet", patterns: [/\b(hello|hi\b|hey\b|good\s*(morning|afternoon|evening|night)|what'?s?\s*up|howdy|yo\b)\b/i], roles: ["rider", "management", "owner"], desc: "Say hello", category: "General" },
  { id: "thanks", patterns: [/\b(thank|thanks|thank\s*you|cheers|awesome|great\s*job|nice\s*one)\b/i], roles: ["rider", "management", "owner"], desc: "Say thanks", category: "General" },
  { id: "time", patterns: [/\b(what\s*time|current\s*time|time\s*(is\s*it|now))\b/i], roles: ["rider", "management", "owner"], desc: "Current time", category: "General" },
  { id: "date", patterns: [/\b(what\s*(is\s*the\s*)?date|today'?s?\s*date|what\s*day)\b/i], roles: ["rider", "management", "owner"], desc: "Current date", category: "General" },
  { id: "who-are-you", patterns: [/\bwho\s*(are\s*you|is\s*monty)\b/i, /\byour\s*name\b/i, /\btell\s*me\s*about\s*(yourself|you)\b/i], roles: ["rider", "management", "owner"], desc: "About Monty", category: "General" },
  { id: "goodbye", patterns: [/\b(goodbye|bye|see\s*you|later|good\s*night|go\s*rest)\b/i], roles: ["rider", "management", "owner"], desc: "Say goodbye", category: "General" },
  { id: "repeat", patterns: [/\b(repeat|say\s*(that\s*)?again|what\s*did\s*you\s*say|come\s*again)\b/i], roles: ["rider", "management", "owner"], desc: "Repeat last response", category: "General" },
  { id: "joke", patterns: [/\b(joke|funny|make\s*me\s*laugh|tell\s*me\s*(a\s*)?joke)\b/i], roles: ["rider", "management", "owner"], desc: "Tell a joke", category: "Fun" },
  { id: "motivate", patterns: [/\b(motivat|encourage|inspire|pump\s*me|pep\s*talk|cheer\s*me)\b/i], roles: ["rider", "management", "owner"], desc: "Motivation", category: "Fun" },
  { id: "safety-tip", patterns: [/\b(safety|safe\s*tip|driving\s*tip|be\s*safe|caution)\b/i], roles: ["rider", "management", "owner"], desc: "Safety tip", category: "Safety" },

  // ══════════════════════════ RIDER: SHIFT ══════════════════════════
  { id: "start-shift", patterns: [/\b(start|begin|open)\b.*\b(shift|work|driving)\b/i, /\bclock\s*in\b/i, /\bstart\s*(my\s*)?shift\b/i], roles: ["rider"], desc: "Start shift", category: "Shift" },
  { id: "end-shift", patterns: [/\b(end|stop|finish|close)\b.*\b(shift|work|driving)\b/i, /\bclock\s*out\b/i, /\bend\s*(my\s*)?shift\b/i, /\bfinish\b/i], roles: ["rider"], desc: "End shift", category: "Shift" },
  { id: "go-online", patterns: [/\b(go|get|come|switch|turn)\s*(back\s*)?online\b/i, /\bonline\b/i], roles: ["rider"], desc: "Go online", category: "Shift" },
  { id: "go-offline", patterns: [/\b(go|get|switch|turn)\s*(back\s*)?offline\b/i, /\boffline\b/i], roles: ["rider"], desc: "Go offline", category: "Shift" },
  { id: "shift-status", patterns: [/\b(am\s*i|shift\s*status|on\s*shift|currently\s*working)\b/i, /\bshift\b.*\b(active|status|on)\b/i], roles: ["rider"], desc: "Shift status", category: "Shift" },
  { id: "shift-duration", patterns: [/\b(how\s*long|shift\s*duration|been\s*(working|on|driving)|time\s*on)\b/i], roles: ["rider"], desc: "Shift duration", category: "Shift" },
  { id: "overtime", patterns: [/\b(over\s*time|extra\s*time|working\s*late|past\s*hours)\b/i], roles: ["rider"], desc: "Overtime check", category: "Shift" },

  // ══════════════════════════ RIDER: TRIPS & FUEL ══════════════════════════
  { id: "log-trip", patterns: [/\b(log|add|new|record)\b.*\b(trip|ride|fare)\b/i, /\bnew\s*trip\b/i, /\badd\s*trip\b/i], roles: ["rider"], desc: "Log a trip", category: "Trips" },
  { id: "log-fuel", patterns: [/\b(log|add|record)\b.*\b(fuel|gas|petrol)\b/i, /\bfuel\b.*\b(log|add)\b/i], roles: ["rider"], desc: "Log fuel", category: "Trips" },
  { id: "fuel-total", patterns: [/\b(fuel|gas|petrol)\b.*\b(total|cost|spent|today)\b/i, /\bhow\s*much\s*(fuel|gas|petrol)\b/i], roles: ["rider"], desc: "Fuel total", category: "Trips" },

  // ══════════════════════════ RIDER: EARNINGS & PAY ══════════════════════════
  { id: "earnings", patterns: [/\b(how\s*much|what).*(earn|made|revenue|money|income)\b/i, /\bearnings?\b/i, /\bmy\s*(money|earnings?|income)\b/i], roles: ["rider"], desc: "Today's earnings", category: "Earnings" },
  { id: "trip-count", patterns: [/\b(how\s*many|number|count).*(trips?|rides?)\b/i, /\btrip\s*(count|total|number)\b/i], roles: ["rider"], desc: "Trip count", category: "Earnings" },
  { id: "target", patterns: [/\btarget\b/i, /\b(how\s*(close|far)|progress)\b/i], roles: ["rider"], desc: "Daily target", category: "Earnings" },
  { id: "bonus", patterns: [/\bbonus\b/i], roles: ["rider"], desc: "Today's bonus", category: "Earnings" },
  { id: "owed", patterns: [/\b(owe|owed|they\s*owe|pay\s*me|give\s*me|get\s*paid|receive)\b/i, /\bmanagement\s*owe/i], roles: ["rider"], desc: "What management owes", category: "Earnings" },
  { id: "monthly", patterns: [/\b(monthly|month)\b.*\b(salary|pay|wage|earnings?)\b/i, /\bsalary\b/i], roles: ["rider"], desc: "Monthly salary", category: "Earnings" },
  { id: "remittance", patterns: [/\bremittance\b/i, /\bsubmit\b.*\b(money|earning|all)\b/i], roles: ["rider"], desc: "Remittance info", category: "Earnings" },
  { id: "compare-yesterday", patterns: [/\byesterday\b/i, /\bcompare\b/i, /\blast\s*shift\b/i, /\bhow\s*was\s*yesterday\b/i], roles: ["rider"], desc: "Compare vs yesterday", category: "Earnings" },
  { id: "average-earnings", patterns: [/\baverage\b/i, /\b(daily|per\s*day)\s*average\b/i], roles: ["rider"], desc: "Average earnings", category: "Earnings" },
  { id: "best-day", patterns: [/\b(best|highest|top|record)\s*(day|earnings?|revenue)\b/i, /\bpeak\b/i], roles: ["rider"], desc: "Best day this week", category: "Earnings" },

  // ══════════════════════════ RIDER: PERFORMANCE ══════════════════════════
  { id: "performance", patterns: [/\b(how\s*am\s*i|performance|doing|summary|report|brief|overview|dashboard)\b/i, /\bmy\s*(stats?|performance|report)\b/i], roles: ["rider"], desc: "Performance summary", category: "Performance" },

  // ══════════════════════════ RIDER: COMMUNICATION ══════════════════════════
  { id: "send-message", patterns: [/\b(send|write|new)\b.*\bmessage\b/i, /\bmessage\s*(management|boss|owner)\b/i, /\btell\s*(management|boss|owner)\b/i], roles: ["rider"], desc: "Send message", category: "Communication" },
  { id: "my-messages", patterns: [/\b(my\s*)?messages?\b/i, /\b(inbox|unread)\b/i, /\bany\s*messages?\b/i], roles: ["rider"], desc: "Check messages", category: "Communication" },
  { id: "report-incident", patterns: [/\b(report|incident|accident|breakdown|theft)\b/i, /\bsomething\s*(happened|wrong)\b/i], roles: ["rider"], desc: "Report incident", category: "Communication" },
  { id: "request-leave", patterns: [/\b(request|need|want)\s*(a\s*)?(leave|day\s*off|time\s*off|break|rest)\b/i, /\bleave\s*request\b/i], roles: ["rider"], desc: "Request leave", category: "Communication" },

  // ══════════════════════════ MANAGEMENT: REVENUE & FINANCE ══════════════════════════
  { id: "mgmt-revenue", patterns: [/\brevenue\b/i, /\b(today|total|how\s*much)\b.*(revenue|money|made|earned)\b/i], roles: ["management", "owner"], desc: "Today's revenue", category: "Revenue" },
  { id: "mgmt-profit", patterns: [/\bprofit\b/i, /\bnet\s*(income|earnings?)\b/i], roles: ["management", "owner"], desc: "Profit", category: "Revenue" },
  { id: "mgmt-expenses", patterns: [/\b(expense|spending|spent|cost)\b/i, /\bhow\s*much\s*(spent|expense)\b/i], roles: ["management", "owner"], desc: "Expenses", category: "Revenue" },
  { id: "mgmt-week", patterns: [/\b(week|weekly)\b/i, /\bthis\s*week\b/i], roles: ["management", "owner"], desc: "Weekly revenue", category: "Revenue" },
  { id: "mgmt-compare", patterns: [/\byesterday\b/i, /\bcompare\b/i, /\bvs?\s*yesterday\b/i], roles: ["management", "owner"], desc: "Compare vs yesterday", category: "Revenue" },
  { id: "mgmt-payments", patterns: [/\bpayment\b/i, /\b(total\s*)?paid\b/i], roles: ["management", "owner"], desc: "Payment summary", category: "Revenue" },

  // ══════════════════════════ MANAGEMENT: RIDERS ══════════════════════════
  { id: "mgmt-riders", patterns: [/\b(how\s*many|count|active|total)\b.*\briders?\b/i, /\bwho.*(shift|working)\b/i, /\briders?\b.*(active|on|shift)\b/i], roles: ["management", "owner"], desc: "Active riders", category: "Riders" },
  { id: "mgmt-remittance", patterns: [/\b(remittance|collection|collected)\b/i], roles: ["management", "owner"], desc: "Remittance status", category: "Riders" },
  { id: "mgmt-owe-riders", patterns: [/\b(owe|payable)\b.*\briders?\b/i, /\brider\s*(pay|payable|wage)\b/i], roles: ["management", "owner"], desc: "Rider payables", category: "Riders" },
  { id: "mgmt-best-rider", patterns: [/\b(best|top|star)\s*rider\b/i, /\b(who|which)\s*(is\s*)?(best|top)\b/i], roles: ["management", "owner"], desc: "Top performer", category: "Riders" },

  // ══════════════════════════ MANAGEMENT: FLEET & OPS ══════════════════════════
  { id: "mgmt-fleet", patterns: [/\bfleet\b/i, /\btricycle\b/i, /\bvehicle\b/i], roles: ["management", "owner"], desc: "Fleet info", category: "Fleet" },
  { id: "mgmt-trips", patterns: [/\b(how\s*many|total)\b.*\btrips?\b/i, /\btrip\s*(count|total)\b/i], roles: ["management", "owner"], desc: "Today's trips", category: "Fleet" },
  { id: "mgmt-fuel", patterns: [/\b(fuel|gas|petrol)\b.*\b(cost|total|fleet|all)\b/i, /\bfleet\s*fuel\b/i], roles: ["management", "owner"], desc: "Fleet fuel cost", category: "Fleet" },
  { id: "mgmt-maintenance", patterns: [/\b(maintenance|repair|service|mechanic)\b/i], roles: ["management", "owner"], desc: "Maintenance status", category: "Fleet" },
  { id: "mgmt-documents", patterns: [/\b(document|insurance|permit|roadworthy|expir|licence|registration)\b/i], roles: ["management", "owner"], desc: "Document status", category: "Fleet" },
  { id: "mgmt-efficiency", patterns: [/\b(efficiency|utilization|productive|idle)\b/i], roles: ["management", "owner"], desc: "Fleet efficiency", category: "Fleet" },

  // ══════════════════════════ MANAGEMENT: HR & COMPLIANCE ══════════════════════════
  { id: "mgmt-alerts", patterns: [/\b(alert|warning|issue|problem|critical)\b/i], roles: ["management", "owner"], desc: "Alerts", category: "HR" },
  { id: "mgmt-leave", patterns: [/\b(leave|day\s*off|time\s*off)\s*(request|pending|queued)?\b/i], roles: ["management", "owner"], desc: "Leave requests", category: "HR" },
  { id: "mgmt-incidents", patterns: [/\b(incident|accident|breakdown|theft|reported)\b/i], roles: ["management", "owner"], desc: "Incidents", category: "HR" },
  { id: "mgmt-messages", patterns: [/\b(message|inbox|unread)\b/i], roles: ["management", "owner"], desc: "Messages", category: "HR" },
  { id: "mgmt-notifications", patterns: [/\b(notification|bell|unread\s*notification)\b/i], roles: ["management", "owner"], desc: "Notifications", category: "HR" },

  // ══════════════════════════ MANAGEMENT: BRIEFING ══════════════════════════
  { id: "mgmt-briefing", patterns: [/\b(brief|briefing|summary|report|overview|dashboard|status|how('?s| is)\s*(the\s*)?(business|everything|things|it\s*going))\b/i], roles: ["management", "owner"], desc: "Full briefing", category: "Briefing" },
];

// ─── Component ───
export function VoiceBot() {
  // State
  const [state, setState] = useState<BotState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<BotState>("idle");
  const supported = useRef(false);
  const lastCmdRef = useRef<string | null>(null);
  const lastResponseRef = useRef("");
  const commandCountRef = useRef(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  const addChat = useCallback((role: "user" | "monty", text: string) => {
    setChat((prev) => [...prev.slice(-9), { role, text, ts: Date.now() }]);
  }, []);

  // ── Store hooks ──
  const user = useAuthStore((s) => s.user);

  const {
    isShiftActive, isOnline, todayEarnings, tripCount, currentShiftId, clockInTime,
    startShift: ssStartShift, endShift: ssEndShift, addTrip: ssAddTrip, loadTodayData,
    goOnline: ssGoOnline, goOffline: ssGoOffline,
  } = useShiftStore(
    useShallow((s) => ({
      isShiftActive: s.isShiftActive,
      isOnline: s.isOnline,
      todayEarnings: s.todayEarnings,
      tripCount: s.tripCount,
      currentShiftId: s.currentShiftId,
      clockInTime: s.clockInTime,
      startShift: s.startShift,
      endShift: s.endShift,
      addTrip: s.addTrip,
      loadTodayData: s.loadTodayData,
      goOnline: s.goOnline,
      goOffline: s.goOffline,
    }))
  );

  const {
    settings, dailyLogs, appShifts, appTrips, appRemittances,
    riders, expenses, payments, fuelLogs, maintenance, documents,
    leaveRequests, incidents, messages, appNotifications,
    addDailyLog, addShift, editShift, addTrip: fbAddTrip, addFuelLog,
    addIncident, addLeaveRequest, addMessage,
  } = useFirebaseStore(
    useShallow((s) => ({
      settings: s.settings,
      dailyLogs: s.dailyLogs,
      appShifts: s.appShifts,
      appTrips: s.appTrips,
      appRemittances: s.appRemittances,
      riders: s.riders,
      expenses: s.expenses,
      payments: s.payments,
      fuelLogs: s.fuelLogs,
      maintenance: s.maintenance,
      documents: s.documents,
      leaveRequests: s.leaveRequests,
      incidents: s.incidents,
      messages: s.messages,
      appNotifications: s.appNotifications,
      addDailyLog: s.addDailyLog,
      addShift: s.addShift,
      editShift: s.editShift,
      addTrip: s.addTrip,
      addFuelLog: s.addFuelLog,
      addIncident: s.addIncident,
      addLeaveRequest: s.addLeaveRequest,
      addMessage: s.addMessage,
    }))
  );

  // ── Derived values ──
  const role = user?.role || "";
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const riderMonthlySalary = settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary;
  const fare = settings?.fare || DEFAULTS.fare;
  const todayBonus = Math.max(0, todayEarnings - dailyTarget);
  const todayRiderTotal = riderDailyPay + todayBonus;
  const progress = dailyTarget > 0 ? Math.round((todayEarnings / dailyTarget) * 100) : 0;
  const todayDate = todayISO();
  const pax = settings?.pax || DEFAULTS.pax;
  const fleet = settings?.fleet || DEFAULTS.fleet;

  // ── Management derived data (comprehensive) ──
  const mgmt = useMemo(() => {
    if (role !== "owner") return null;

    const tLogs = Object.values(dailyLogs).filter((l) => l.date === todayDate);
    const revenue = tLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    const trips = tLogs.reduce((s, l) => s + (l.trips || 0), 0);

    const activeShifts = Object.values(appShifts).filter((s) => s.status === "active");
    const riderList = Object.entries(riders).map(([id, r]) => ({ ...r, id }));
    const activeRiders = riderList.filter((r) => r.status === "active").length;

    const todayRemit = Object.values(appRemittances).filter((r) => r.remittance_date === todayDate);
    const remitCollected = todayRemit.reduce((s, r) => s + r.amount, 0);

    const totalRev = Object.values(dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0);
    const totalExp = Object.values(expenses).reduce((s, e) => s + (e.amount || 0), 0);

    const liveTrips = Object.entries(appTrips)
      .filter(([, t]) => t.created_at?.startsWith(todayDate))
      .map(([id, t]) => ({ ...t, id }));
    const liveEarnings = liveTrips.reduce((s, t) => s + (t.fare_amount || 0), 0);

    // Weekly
    const weekDates = weekDatesISO();
    let weekTotal = 0;
    for (const ds of weekDates) {
      weekTotal += Object.values(dailyLogs)
        .filter((l) => l.date === ds)
        .reduce((s, l) => s + (l.total_revenue || 0), 0);
    }

    // Yesterday
    const yDate = yesterdayISO();
    const yLogs = Object.values(dailyLogs).filter((l) => l.date === yDate);
    const yRevenue = yLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    const yTrips = yLogs.reduce((s, l) => s + (l.trips || 0), 0);

    // Rider payables
    let dailyPayTotal = 0;
    let bonusTotal = 0;
    const riderIds = new Set<string>();
    activeShifts.forEach((s) => riderIds.add(s.rider_id));
    dailyPayTotal = riderIds.size * riderDailyPay;
    Object.entries(appShifts)
      .filter(([, s]) => s.status === "active")
      .forEach(([shiftKey]) => {
        const e = liveTrips
          .filter((t) => t.shift_id === shiftKey)
          .reduce((s, t) => s + (t.fare_amount || 0), 0);
        bonusTotal += Math.max(0, e - dailyTarget);
      });

    // Expenses today
    const todayExpenses = Object.values(expenses).filter((e) => e.date === todayDate);
    const todayExpTotal = todayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const expByCategory: Record<string, number> = {};
    todayExpenses.forEach((e) => {
      expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount;
    });

    // Fuel fleet
    const todayFuel = Object.values(fuelLogs).filter((f) => f.date === todayDate);
    const fuelTotal = todayFuel.reduce((s, f) => s + (f.cost || 0), 0);

    // Maintenance
    const recentMaint = Object.values(maintenance).sort((a, b) => b.date.localeCompare(a.date));
    const pendingMaint = recentMaint.filter((m) => m.date >= todayDate);
    const totalMaintCost = Object.values(maintenance).reduce((s, m) => s + (m.total_cost || 0), 0);

    // Documents expiring in 30 days
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    const expiringDocs = Object.values(documents).filter(
      (d) => d.expiry_date && d.expiry_date <= in30Str && d.expiry_date >= todayDate
    );
    const expiredDocs = Object.values(documents).filter(
      (d) => d.expiry_date && d.expiry_date < todayDate
    );

    // Leave requests
    const pendingLeaves = Object.values(leaveRequests).filter((l) => l.status === "pending");

    // Incidents
    const openIncidents = Object.values(incidents).filter((i) => i.status !== "resolved");
    const highIncidents = openIncidents.filter((i) => i.severity === "high");

    // Messages
    const allMsgs = Object.values(messages);
    const unreadMsgs = allMsgs.filter((m) => !m.read_by?.[user?.id || ""]);

    // Notifications
    const unreadNotifs = Object.values(appNotifications).filter((n) => !n.read);

    // Payments
    const totalPaid = Object.values(payments).reduce((s, p) => s + (p.amount || 0), 0);
    const todayPayments = Object.values(payments).filter((p) => p.date === todayDate);
    const todayPaidTotal = todayPayments.reduce((s, p) => s + (p.amount || 0), 0);

    // Best rider today (from live trips)
    const riderEarnings: Record<string, number> = {};
    liveTrips.forEach((t) => {
      riderEarnings[t.rider_id] = (riderEarnings[t.rider_id] || 0) + (t.fare_amount || 0);
    });
    let bestRiderId = "";
    let bestRiderEarnings = 0;
    Object.entries(riderEarnings).forEach(([id, e]) => {
      if (e > bestRiderEarnings) { bestRiderId = id; bestRiderEarnings = e; }
    });
    const bestRiderName = bestRiderId ? (riders[bestRiderId]?.name || bestRiderId) : null;

    return {
      revenue: Math.max(revenue, liveEarnings),
      trips: Math.max(trips, liveTrips.length),
      activeShifts: activeShifts.length,
      activeRiders,
      remitCollected,
      profit: totalRev - totalExp,
      weekTotal,
      riderPayables: dailyPayTotal + bonusTotal,
      dailyPayTotal,
      bonusTotal,
      pending: todayRemit.filter((r) => r.status === "pending").length,
      riderCount: riderList.length,
      fleet,
      // New
      yRevenue,
      yTrips,
      todayExpTotal,
      expByCategory,
      fuelTotal,
      pendingMaint: pendingMaint.length,
      totalMaintCost,
      recentMaint: recentMaint[0],
      expiringDocs: expiringDocs.length,
      expiredDocs: expiredDocs.length,
      pendingLeaves: pendingLeaves.length,
      openIncidents: openIncidents.length,
      highIncidents: highIncidents.length,
      unreadMsgs: unreadMsgs.length,
      unreadNotifs: unreadNotifs.length,
      totalPaid,
      todayPaidTotal,
      bestRiderName,
      bestRiderEarnings,
      riderList,
    };
  }, [role, dailyLogs, todayDate, appShifts, riders, appRemittances, expenses, appTrips,
    riderDailyPay, dailyTarget, fuelLogs, maintenance, documents, leaveRequests,
    incidents, messages, appNotifications, payments, fleet]);

  // ── Rider derived data ──
  const riderData = useMemo(() => {
    if (role !== "rider") return null;

    const yDate = yesterdayISO();
    const yLogs = Object.values(dailyLogs).filter((l) => l.date === yDate);
    const yRevenue = yLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    const yTrips = yLogs.reduce((s, l) => s + (l.trips || 0), 0);

    const weekDates = weekDatesISO();
    const weekLogs = Object.values(dailyLogs).filter((l) => weekDates.includes(l.date));
    const weekRevenue = weekLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    const weekTrips = weekLogs.reduce((s, l) => s + (l.trips || 0), 0);
    const activeDays = new Set(weekLogs.map((l) => l.date)).size;
    const avgEarnings = activeDays > 0 ? weekRevenue / activeDays : 0;

    // Best day this week
    const byDay: Record<string, number> = {};
    weekLogs.forEach((l) => { byDay[l.date] = (byDay[l.date] || 0) + (l.total_revenue || 0); });
    let bestDate = "";
    let bestAmt = 0;
    Object.entries(byDay).forEach(([dt, amt]) => {
      if (amt > bestAmt) { bestDate = dt; bestAmt = amt; }
    });

    // Fuel today
    const todayFuel = Object.values(fuelLogs).filter((f) => f.date === todayDate);
    const fuelTotal = todayFuel.reduce((s, f) => s + (f.cost || 0), 0);

    // Messages — only those addressed to this rider or broadcast (exclude own sent)
    const myMsgs = Object.values(messages).filter(
      (m) => m.sender_id !== user?.id && (!m.recipient_id || m.recipient_id === user?.id) && !m.read_by?.[user?.id || ""]
    );

    return {
      yRevenue, yTrips, weekRevenue, weekTrips, avgEarnings,
      bestDate, bestAmt, fuelTotal, unreadMsgs: myMsgs.length,
      activeDays,
    };
  }, [role, dailyLogs, todayDate, fuelLogs, messages, user?.id]);

  // ─── Actions ───
  const doLogTrip = useCallback(
    async (tripFare: number) => {
      if (!user || !isShiftActive || !currentShiftId) return;
      const { tripId, shiftId } = ssAddTrip(tripFare);
      await fbAddTrip(tripId, {
        shift_id: shiftId,
        rider_id: user.id,
        tricycle_id: "tricycle-1",
        fare_amount: tripFare,
        trip_time: new Date().toISOString(),
        entry_method: "voice",
        created_at: new Date().toISOString(),
      }).catch(() => {});
      await addDailyLog({
        date: todayDate,
        bike: 1,
        rider: user.name,
        trips: tripCount + 1,
        passengers: (tripCount + 1) * pax,
        fare: tripFare,
        fare_revenue: todayEarnings + tripFare,
        extra_income: 0,
        total_revenue: todayEarnings + tripFare,
        fuel_cost: 0,
        notes: "Voice-logged via Hey Monty",
      }).catch(() => {});
    },
    [user, isShiftActive, currentShiftId, ssAddTrip, fbAddTrip, addDailyLog, todayDate, tripCount, todayEarnings, pax]
  );

  const doStartShift = useCallback(async () => {
    if (!user) return;
    const shiftId = ssStartShift(user.id, "tricycle-1");
    const now = new Date().toISOString();
    await addShift(shiftId, {
      rider_id: user.id,
      tricycle_id: "tricycle-1",
      clock_in_time: now,
      status: "active",
      total_trips: 0,
      total_earnings: 0,
      total_expenses: 0,
      created_at: now,
      updated_at: now,
    }).catch(() => {});
    await saveNotification({
      type: "shift_started",
      title: "Shift Started (Voice)",
      message: `${user.name} started shift via Hey Monty`,
      icon: "🟢",
      target_role: "management",
      actor: user.name,
      read: false,
      created_at: now,
    }).catch(() => {});
    startLocationTracking(user.id, user.name, shiftId);
  }, [user, ssStartShift, addShift]);

  const doGoOnline = useCallback(async () => {
    if (!user || !isShiftActive) return;
    ssGoOnline();
    startLocationTracking(user.id, user.name, currentShiftId || "");
    await saveNotification({
      type: "rider_online",
      title: "Rider Online (Voice)",
      message: `${user.name} went online via Hey Monty`,
      icon: "🟢",
      target_role: "management",
      actor: user.name,
      read: false,
      created_at: new Date().toISOString(),
    }).catch(() => {});
  }, [user, isShiftActive, currentShiftId, ssGoOnline]);

  const doGoOffline = useCallback(async () => {
    if (!user) return;
    ssGoOffline();
    stopLocationTracking();
    await saveNotification({
      type: "rider_offline",
      title: "Rider Offline (Voice)",
      message: `${user.name} went offline via Hey Monty`,
      icon: "⚫",
      target_role: "management",
      actor: user.name,
      read: false,
      created_at: new Date().toISOString(),
    }).catch(() => {});
  }, [user, ssGoOffline]);

  const doEndShift = useCallback(async () => {
    if (!user || !currentShiftId) return;
    const result = ssEndShift();
    if (!result) return;
    await editShift(currentShiftId, {
      clock_out_time: new Date().toISOString(),
      status: "completed",
      total_earnings: result.earnings,
      total_trips: result.trips,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
    await addDailyLog({
      date: todayDate,
      bike: 1,
      rider: user.name,
      trips: result.trips,
      passengers: result.trips * pax,
      fare,
      fare_revenue: result.earnings,
      extra_income: 0,
      total_revenue: result.earnings,
      fuel_cost: 0,
      notes: `Voice shift end via Hey Monty — ${currentShiftId}`,
    }).catch(() => {});
    await saveNotification({
      type: "shift_ended",
      title: "Shift Ended (Voice)",
      message: `${user.name} ended shift — ${result.trips} trips, ${formatCurrency(result.earnings)}`,
      icon: "🔴",
      target_role: "management",
      actor: user.name,
      read: false,
      created_at: new Date().toISOString(),
    }).catch(() => {});
    ssGoOffline();
    clearLocationFromMap();
  }, [user, currentShiftId, ssEndShift, ssGoOffline, editShift, addDailyLog, todayDate, fare, pax]);

  const doLogFuel = useCallback(
    async (amount: number) => {
      if (!user) return;
      await addFuelLog({
        date: todayDate,
        litres: 0,
        cost: amount,
        odometer: 0,
        notes: `Voice-logged by ${user.name} via Hey Monty`,
      }).catch(() => {});
    },
    [user, addFuelLog, todayDate]
  );

  const doReportIncident = useCallback(
    async (type: "accident" | "breakdown" | "theft" | "police" | "other", description: string) => {
      if (!user) return;
      await addIncident({
        rider_id: user.id,
        rider_name: user.name,
        tricycle_id: "tricycle-1",
        incident_type: type,
        severity: type === "accident" ? "high" : "medium",
        description,
        status: "reported",
        created_at: new Date().toISOString(),
      }).catch(() => {});
      await saveNotification({
        type: "incident_reported",
        title: "Incident Reported (Voice)",
        message: `${user.name} reported: ${type} — ${description}`,
        icon: "🚨",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    },
    [user, addIncident]
  );

  const doRequestLeave = useCallback(
    async (reason: string) => {
      if (!user) return;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await addLeaveRequest({
        rider_id: user.id,
        rider_name: user.name,
        start_date: tomorrow.toISOString().slice(0, 10),
        end_date: tomorrow.toISOString().slice(0, 10),
        reason,
        status: "pending",
        created_at: new Date().toISOString(),
      }).catch(() => {});
      await saveNotification({
        type: "leave_requested",
        title: "Leave Requested (Voice)",
        message: `${user.name} requested leave: ${reason}`,
        icon: "📅",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    },
    [user, addLeaveRequest]
  );

  const doSendMessage = useCallback(
    async (content: string) => {
      if (!user) return;
      await addMessage({
        sender_id: user.id,
        sender_name: user.name,
        sender_role: role === "rider" ? "rider" : "owner",
        content,
        priority: "normal",
        read_by: { [user.id]: true },
        created_at: new Date().toISOString(),
      }).catch(() => {});
      await saveNotification({
        type: "message_received",
        title: "💬 New Message",
        message: `${user.name}: ${content.slice(0, 80)}`,
        icon: "💬",
        target_role: role === "rider" ? "management" : "rider",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    },
    [user, role, addMessage]
  );

  // ─── Command Processor (the "brain") ───
  const processCommand = useCallback(
    async (rawText: string): Promise<CmdResult> => {
      if (!user) return { text: "Please log in first." };

      const text = rawText
        .toLowerCase()
        .replace(/hey\s*mont[iy]e?\s*/gi, "")
        .replace(/^[,.\s]+/, "")
        .trim();
      if (!text) return { text: "I didn't hear anything. Tap the mic and try again." };

      const name = user.name?.split(" ")[0] || "boss";
      commandCountRef.current++;

      // Match command
      const matched = COMMANDS.find((cmd) => {
        if (!cmd.roles.includes(role)) return false;
        return cmd.patterns.some((p) => p.test(text));
      });

      if (!matched) {
        // Fuzzy fallback — try to infer from keywords
        const words = text.split(/\s+/);
        if (words.some((w) => ["trip", "ride"].includes(w)) && role === "rider") {
          return processCommand("log trip " + rawText);
        }
        if (words.some((w) => ["fuel", "gas", "petrol"].includes(w)) && role === "rider") {
          return processCommand("log fuel " + rawText);
        }
        // Number-only → assume trip log for riders on shift
        if (role === "rider" && isShiftActive && /^\d+(\.\d+)?$/.test(text)) {
          return processCommand("log trip " + rawText);
        }
        return {
          text: `Sorry ${name}, I didn't catch that. Say "help" to hear what I can do. I understand ${COMMANDS.filter((c) => c.roles.includes(role)).length}+ commands!`,
        };
      }

      lastCmdRef.current = matched.id;

      // ── Execute ──
      switch (matched.id) {
        // ══════════════════════════ UNIVERSAL ══════════════════════════
        case "help": {
          const available = COMMANDS.filter((c) => c.roles.includes(role));
          const categories = [...new Set(available.map((c) => c.category))];
          const summary = categories.map((cat) => {
            const cmds = available.filter((c) => c.category === cat);
            return `${cat}: ${cmds.map((c) => c.desc).join(", ")}`;
          }).join(". ");
          return {
            text: `I know ${available.length} commands! ${summary}. What would you like, ${name}?`,
          };
        }
        case "greet": {
          const g = timeGreeting();
          if (role === "rider") {
            const shiftInfo = isShiftActive
              ? `You're on shift with ${plural(tripCount, "trip")} and ${speakAmount(todayEarnings)} earned.`
              : "You're not on shift yet. Say \"start shift\" when you're ready.";
            const targetInfo = todayEarnings >= dailyTarget
              ? `You've already hit your target — bonus is ${speakAmount(todayBonus)}!`
              : `${speakAmount(dailyTarget - todayEarnings)} left to hit your ${speakAmount(dailyTarget)} target.`;
            return {
              text: `${g}, ${name}! ${shiftInfo} ${targetInfo} How can I help?`,
            };
          }
          // Management greeting/briefing
          if (mgmt) {
            return {
              text: `${g}, boss! Today's revenue is ${speakAmount(mgmt.revenue)} from ${plural(mgmt.trips, "trip")}. ${plural(mgmt.activeShifts, "rider")} on shift.${
                mgmt.openIncidents > 0 ? ` ${plural(mgmt.openIncidents, "open incident")}.` : ""
              }${mgmt.pendingLeaves > 0 ? ` ${plural(mgmt.pendingLeaves, "leave request")} pending.` : ""
              }${mgmt.unreadMsgs > 0 ? ` ${plural(mgmt.unreadMsgs, "unread message")}.` : ""} What do you need?`,
            };
          }
          return { text: `${g}, ${name}! I'm Monty, your voice assistant. How can I help?` };
        }
        case "thanks": {
          const responses = [
            `You're welcome, ${name}! Always here for you.`,
            `Anytime, ${name}! That's what I'm here for.`,
            `My pleasure, ${name}! Need anything else?`,
            `No problem at all, ${name}! Glad I could help.`,
          ];
          return { text: randomFrom(responses) };
        }
        case "time":
          return {
            text: `It's ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} on ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.`,
          };
        case "date":
          return {
            text: `Today is ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
          };
        case "who-are-you":
          return {
            text: `I'm Monty, the Montbile Auto Services intelligent voice assistant! I know ${COMMANDS.filter((c) => c.roles.includes(role)).length}+ commands for ${
              role === "rider" ? "managing your shifts, logging trips, tracking earnings, reporting incidents, and more" :
              "tracking revenue, managing riders, monitoring fleet, reviewing expenses, and running your business"
            }. I get smarter every time you talk to me. Just say "help" for the full list!`,
          };
        case "goodbye": {
          const farewells = [
            `Take care, ${name}! See you soon.`,
            `Goodbye, ${name}! Stay safe out there.`,
            `Later, ${name}! ${role === "rider" ? "Drive safe!" : "The business is in good hands!"}`,
            `Bye, ${name}! I'll be here whenever you need me.`,
          ];
          return { text: randomFrom(farewells) };
        }
        case "repeat":
          return { text: lastResponseRef.current || `I haven't said anything yet, ${name}. Ask me something!` };
        case "joke":
          return { text: randomFrom(JOKES) };
        case "motivate":
          return { text: randomFrom(MOTIVATIONAL) };
        case "safety-tip":
          return { text: randomFrom(SAFETY_TIPS) };

        // ══════════════════════════ RIDER: SHIFT ══════════════════════════
        case "start-shift": {
          if (isShiftActive)
            return {
              text: `You're already on shift, ${name}. You clocked in at ${
                clockInTime
                  ? new Date(clockInTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "earlier"
              }. ${plural(tripCount, "trip")} so far.`,
            };
          if (new Date().getHours() < SHIFT_START_HOUR)
            return { text: `Sorry ${name}, shifts start from 6 AM. It's too early! Get some rest and come back later.` };
          try {
            const { atBase, distanceM } = await checkAtBase();
            if (!atBase)
              return {
                text: `Sorry ${name}, you must be at the base station to start. You're ${Math.round(distanceM)} metres away. Head to base and try again.`,
              };
          } catch {
            return { text: `I can't verify your location, ${name}. Make sure GPS is enabled and try again.` };
          }
          return {
            text: `Shift started! Drive safe, ${name}. Your daily target is ${speakAmount(dailyTarget)}. That's about ${Math.ceil(dailyTarget / fare)} trips. Let's get it!`,
            action: doStartShift,
          };
        }
        case "end-shift": {
          if (!isShiftActive) return { text: `You're not on shift, ${name}. Say "start shift" to begin.` };
          try {
            const { atBase, distanceM } = await checkAtBase();
            if (!atBase)
              return {
                text: `You must be at base to end your shift, ${name}. You're ${Math.round(distanceM)} metres away.`,
              };
          } catch {
            return { text: `I can't verify your location, ${name}. Make sure GPS is enabled.` };
          }
          const b = todayBonus;
          const dur = clockInTime ? shortDur(Date.now() - new Date(clockInTime).getTime()) : "";
          return {
            text: `Shift ended! ${dur ? `You worked for ${dur}. ` : ""}${plural(tripCount, "trip")} completed, earning ${speakAmount(todayEarnings)}.${
              b > 0 ? ` Amazing! You earned a ${speakAmount(b)} bonus!` : ""
            } ${progress >= 100 ? "Target reached — great job!" : `${progress}% of your target.`} Rest well, ${name}!`,
            action: doEndShift,
          };
        }
        case "go-online": {
          if (!isShiftActive) return { text: `Start your shift first, ${name}. Say "start my shift".` };
          if (isOnline) return { text: `You're already online, ${name}. GPS is tracking you. Keep riding!` };
          return {
            text: `Going online! Your location is now visible to management. Drive safe, ${name}!`,
            action: doGoOnline,
          };
        }
        case "go-offline": {
          if (!isShiftActive) return { text: `You're not on shift, ${name}.` };
          if (!isOnline) return { text: `You're already offline, ${name}.` };
          return {
            text: `Going offline, ${name}. GPS paused. Say "go online" when ready.`,
            action: doGoOffline,
          };
        }
        case "shift-status": {
          if (!isShiftActive)
            return { text: `You're not on shift, ${name}. Say "start shift" to begin.` };
          const dur = clockInTime ? shortDur(Date.now() - new Date(clockInTime).getTime()) : "";
          const status = isOnline ? "online" : "offline";
          return {
            text: `You've been on shift for ${dur || "a while"}, currently ${status}. ${plural(tripCount, "trip")} earning ${speakAmount(todayEarnings)}. ${
              todayEarnings >= dailyTarget
                ? `Target reached! Bonus: ${speakAmount(todayBonus)}.`
                : `${speakAmount(dailyTarget - todayEarnings)} to target (${progress}%).`
            }`,
          };
        }
        case "shift-duration": {
          if (!isShiftActive || !clockInTime) return { text: `You're not on shift, ${name}.` };
          const ms = Date.now() - new Date(clockInTime).getTime();
          const isOT = new Date().getHours() >= SHIFT_END_HOUR;
          return {
            text: `You've been on shift for ${shortDur(ms)}, ${name}.${isOT ? " You're currently in overtime!" : ""}`,
          };
        }
        case "overtime": {
          if (!isShiftActive) return { text: `You're not on shift, ${name}.` };
          const now = new Date();
          if (now.getHours() >= SHIFT_END_HOUR) {
            const otStart = new Date(now);
            otStart.setHours(SHIFT_END_HOUR, 0, 0, 0);
            return {
              text: `Yes, you're in overtime! You've been in OT for ${shortDur(now.getTime() - otStart.getTime())}. Standard shift ends at ${SHIFT_END_HOUR}:00. Consider wrapping up if you're tired, ${name}.`,
            };
          }
          const minsLeft = (SHIFT_END_HOUR - now.getHours()) * 60 - now.getMinutes();
          return {
            text: `No overtime yet, ${name}. You have about ${minsLeft} minutes until ${SHIFT_END_HOUR}:00 when overtime begins.`,
          };
        }

        // ══════════════════════════ RIDER: TRIPS & FUEL ══════════════════════════
        case "log-trip": {
          if (!isShiftActive)
            return { text: `Start your shift first, ${name}. Say "start my shift".` };
          const tripFare = extractNumber(text) || fare;
          const newTotal = todayEarnings + tripFare;
          const newCount = tripCount + 1;
          const hitTarget = newTotal >= dailyTarget && todayEarnings < dailyTarget;
          const tripsNeeded = Math.max(0, Math.ceil((dailyTarget - newTotal) / fare));
          let encouragement = "";
          if (hitTarget) {
            encouragement = " You just hit your target! Every trip from here is bonus money!";
          } else if (newTotal >= dailyTarget * 0.8 && todayEarnings < dailyTarget * 0.8) {
            encouragement = " Almost there! Just a few more trips to target!";
          } else if (tripsNeeded > 0) {
            encouragement = ` About ${tripsNeeded} more trip${tripsNeeded !== 1 ? "s" : ""} to target.`;
          }
          return {
            text: `Trip logged! ${speakAmount(tripFare)}. ${plural(newCount, "trip")} totalling ${speakAmount(newTotal)}.${encouragement}`,
            action: () => doLogTrip(tripFare),
          };
        }
        case "log-fuel": {
          const amt = extractNumber(text);
          if (!amt) return { text: `Include the amount, ${name}. Say "log fuel 20 cedis".` };
          return {
            text: `Fuel logged: ${speakAmount(amt)}. ${riderData?.fuelTotal ? `Total fuel today: ${speakAmount(riderData.fuelTotal + amt)}.` : ""} Stay fueled, ${name}!`,
            action: () => doLogFuel(amt),
          };
        }
        case "fuel-total": {
          const total = riderData?.fuelTotal || 0;
          return {
            text: total > 0
              ? `You've spent ${speakAmount(total)} on fuel today, ${name}.`
              : `No fuel logged today, ${name}. Say "log fuel" followed by the amount when you fuel up.`,
          };
        }

        // ══════════════════════════ RIDER: EARNINGS & PAY ══════════════════════════
        case "earnings": {
          const left = dailyTarget - todayEarnings;
          const avgTrip = tripCount > 0 ? todayEarnings / tripCount : 0;
          return {
            text: `${speakAmount(todayEarnings)} earned from ${plural(tripCount, "trip")}.${
              avgTrip > 0 ? ` Average ${speakAmount(avgTrip)} per trip.` : ""
            } ${
              todayEarnings >= dailyTarget
                ? `Target smashed! Bonus: ${speakAmount(todayBonus)}.`
                : `${speakAmount(left)} more to hit ${speakAmount(dailyTarget)} (${progress}%).`
            }`,
          };
        }
        case "trip-count": {
          const avgTrip = tripCount > 0 ? todayEarnings / tripCount : 0;
          const needed = Math.max(0, Math.ceil((dailyTarget - todayEarnings) / fare));
          return {
            text: `${plural(tripCount, "trip")} today, ${name}. ${avgTrip > 0 ? `Averaging ${speakAmount(avgTrip)} each.` : ""} ${
              needed > 0 ? `About ${needed} more to hit target.` : "Target reached!"
            }`,
          };
        }
        case "target": {
          const needed = Math.max(0, Math.ceil((dailyTarget - todayEarnings) / fare));
          return {
            text: `Target: ${speakAmount(dailyTarget)}. You're at ${speakAmount(todayEarnings)} (${progress}%).${
              progress >= 100
                ? ` Smashed it! Bonus: ${speakAmount(todayBonus)}.`
                : ` ${speakAmount(dailyTarget - todayEarnings)} and about ${needed} trip${needed !== 1 ? "s" : ""} to go.`
            }`,
          };
        }
        case "bonus":
          return {
            text: todayBonus > 0
              ? `You've earned a ${speakAmount(todayBonus)} bonus by exceeding the ${speakAmount(dailyTarget)} target! Keep going, ${name}!`
              : `No bonus yet. Earn above ${speakAmount(dailyTarget)} to unlock it. You're at ${speakAmount(todayEarnings)} (${progress}%).${
                  progress >= 80 ? " So close!" : ""
                }`,
          };
        case "owed":
          return {
            text: `Management owes you ${speakAmount(todayRiderTotal)} today. That's ${speakAmount(riderDailyPay)} daily pay${
              todayBonus > 0 ? ` plus ${speakAmount(todayBonus)} bonus` : ""
            }. Submit via the Earnings tab to get paid.`,
          };
        case "monthly":
          return {
            text: `Monthly salary: ${speakAmount(riderMonthlySalary)}, ${name}. Plus daily bonuses when you exceed your ${speakAmount(dailyTarget)} target. Keep pushing!`,
          };
        case "remittance":
          return {
            text: `Submit your earnings to management. Today: ${speakAmount(todayEarnings)}. They pay you back ${speakAmount(riderDailyPay)}${
              todayBonus > 0 ? ` plus ${speakAmount(todayBonus)} bonus` : ""
            }. Use the Earnings tab to submit.`,
          };
        case "compare-yesterday": {
          if (!riderData) return { text: "No comparison data available." };
          const diff = todayEarnings - riderData.yRevenue;
          const tripDiff = tripCount - riderData.yTrips;
          if (riderData.yRevenue === 0 && riderData.yTrips === 0) {
            return { text: `No data from yesterday, ${name}. Today you have ${speakAmount(todayEarnings)} from ${plural(tripCount, "trip")}.` };
          }
          return {
            text: `Yesterday: ${speakAmount(riderData.yRevenue)} from ${plural(riderData.yTrips, "trip")}. Today so far: ${speakAmount(todayEarnings)} from ${plural(tripCount, "trip")}. ${
              diff > 0 ? `You're ahead by ${speakAmount(diff)}!` :
              diff < 0 ? `${speakAmount(Math.abs(diff))} behind yesterday. Let's catch up!` :
              "Same as yesterday so far!"
            }${tripDiff !== 0 ? ` ${Math.abs(tripDiff)} ${tripDiff > 0 ? "more" : "fewer"} trip${Math.abs(tripDiff) !== 1 ? "s" : ""}.` : ""}`,
          };
        }
        case "average-earnings": {
          if (!riderData) return { text: "No data to calculate average." };
          return {
            text: riderData.avgEarnings > 0
              ? `Your weekly average is ${speakAmount(riderData.avgEarnings)} per day over ${plural(riderData.activeDays, "active day")}. Total this week: ${speakAmount(riderData.weekRevenue)} from ${plural(riderData.weekTrips, "trip")}.`
              : `No data this week yet, ${name}. Complete some shifts and I'll calculate your average.`,
          };
        }
        case "best-day": {
          if (!riderData || !riderData.bestDate) return { text: `No data this week yet, ${name}.` };
          const d = new Date(riderData.bestDate);
          const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
          return {
            text: `Your best day this week was ${dayName} with ${speakAmount(riderData.bestAmt)}! ${
              todayEarnings > riderData.bestAmt
                ? `But today you've already beaten it with ${speakAmount(todayEarnings)}!`
                : `Today you're at ${speakAmount(todayEarnings)}.`
            }`,
          };
        }

        // ══════════════════════════ RIDER: PERFORMANCE ══════════════════════════
        case "performance": {
          const dur = clockInTime ? shortDur(Date.now() - new Date(clockInTime).getTime()) : "";
          const avgTrip = tripCount > 0 ? todayEarnings / tripCount : 0;
          const needed = Math.max(0, Math.ceil((dailyTarget - todayEarnings) / fare));
          const fuel = riderData?.fuelTotal || 0;
          const netToday = todayEarnings - fuel;

          let rating = "Warming up";
          if (progress >= 120) rating = "Superstar";
          else if (progress >= 100) rating = "On fire";
          else if (progress >= 80) rating = "Great";
          else if (progress >= 50) rating = "Good";

          const parts = [
            `Here's your performance report, ${name}.`,
            isShiftActive ? `On shift for ${dur || "a while"}, ${isOnline ? "online" : "offline"}.` : "Not currently on shift.",
            `${plural(tripCount, "trip")} earning ${speakAmount(todayEarnings)} (${progress}% of target).`,
            avgTrip > 0 ? `Average ${speakAmount(avgTrip)} per trip.` : "",
            todayBonus > 0 ? `Bonus: ${speakAmount(todayBonus)}!` : needed > 0 ? `${needed} more trips to target.` : "",
            fuel > 0 ? `Fuel spent: ${speakAmount(fuel)}. Net: ${speakAmount(netToday)}.` : "",
            `Rating: ${rating}!`,
            riderData?.yRevenue ? `Yesterday was ${speakAmount(riderData.yRevenue)}.` : "",
          ];
          return { text: parts.filter(Boolean).join(" ") };
        }

        // ══════════════════════════ RIDER: COMMUNICATION ══════════════════════════
        case "send-message": {
          const content = text
            .replace(/\b(send|write|new)\s*(a\s*)?(message|msg)\s*(to\s*)?(management|boss|owner)?\s*/i, "")
            .trim();
          if (!content || content.length < 3) {
            return { text: `What's the message, ${name}? Say "send message" followed by what you want to tell management.` };
          }
          return {
            text: `Message sent to management: "${content}". They'll see it shortly, ${name}.`,
            action: () => doSendMessage(content),
          };
        }
        case "my-messages": {
          const count = riderData?.unreadMsgs || 0;
          return {
            text: count > 0
              ? `You have ${plural(count, "unread message")}, ${name}. Go to your Messages tab to read them.`
              : `No unread messages, ${name}. All caught up!`,
          };
        }
        case "report-incident": {
          // Extract incident type from text
          let incType: "accident" | "breakdown" | "theft" | "police" | "other" = "other";
          if (/accident|crash|collision|hit/i.test(text)) incType = "accident";
          else if (/breakdown|broke|engine|stuck/i.test(text)) incType = "breakdown";
          else if (/theft|stolen|rob/i.test(text)) incType = "theft";
          else if (/police|officer|stop|checkpoint/i.test(text)) incType = "police";

          const desc = text
            .replace(/\b(report|incident|something\s*(happened|wrong))\s*/i, "")
            .trim() || `${incType} reported via voice`;

          return {
            text: `Incident reported: ${incType}. Management has been notified immediately, ${name}. ${
              incType === "accident" ? "Are you okay? If you're hurt, please call for help immediately!" :
              incType === "breakdown" ? "Stay safe. Management will arrange support." :
              "Stay safe and await instructions from management."
            }`,
            action: () => doReportIncident(incType, desc),
          };
        }
        case "request-leave": {
          const reason = text
            .replace(/\b(request|need|want)\s*(a\s*)?(leave|day\s*off|time\s*off|break|rest)\s*/i, "")
            .trim() || "Personal reasons (voice request)";

          return {
            text: `Leave request submitted for tomorrow, ${name}. Reason: "${reason}". Management will review it. You'll be notified when it's approved.`,
            action: () => doRequestLeave(reason),
          };
        }

        // ══════════════════════════ MANAGEMENT: REVENUE & FINANCE ══════════════════════════
        case "mgmt-revenue":
          return {
            text: mgmt
              ? `Today's revenue: ${speakAmount(mgmt.revenue)} from ${plural(mgmt.trips, "trip")}. ${plural(mgmt.activeShifts, "rider")} on shift.${
                  mgmt.yRevenue > 0 ? ` Yesterday was ${speakAmount(mgmt.yRevenue)}.` : ""
                }`
              : "No revenue data yet.",
          };
        case "mgmt-profit":
          return {
            text: mgmt
              ? `Total profit: ${speakAmount(mgmt.profit)}. Revenue: ${speakAmount(Object.values(dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0))} minus expenses: ${speakAmount(Object.values(expenses).reduce((s, e) => s + (e.amount || 0), 0))}.${
                  mgmt.todayExpTotal > 0 ? ` Today's expenses: ${speakAmount(mgmt.todayExpTotal)}.` : ""
                }`
              : "No data.",
          };
        case "mgmt-expenses": {
          if (!mgmt) return { text: "No expense data." };
          const totalExp = Object.values(expenses).reduce((s, e) => s + (e.amount || 0), 0);
          const catList = Object.entries(mgmt.expByCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([cat, amt]) => `${cat}: ${speakAmount(amt)}`)
            .join(", ");
          return {
            text: `Total expenses: ${speakAmount(totalExp)}. Today: ${speakAmount(mgmt.todayExpTotal)}.${
              catList ? ` Today's top categories: ${catList}.` : ""
            }`,
          };
        }
        case "mgmt-week":
          return {
            text: mgmt ? `This week's revenue: ${speakAmount(mgmt.weekTotal)}.${
              mgmt.revenue > 0 ? ` Today alone is ${speakAmount(mgmt.revenue)}.` : ""
            }` : "No weekly data.",
          };
        case "mgmt-compare": {
          if (!mgmt) return { text: "No comparison data." };
          const diff = mgmt.revenue - mgmt.yRevenue;
          return {
            text: `Yesterday: ${speakAmount(mgmt.yRevenue)} from ${plural(mgmt.yTrips, "trip")}. Today: ${speakAmount(mgmt.revenue)} from ${plural(mgmt.trips, "trip")}. ${
              diff > 0 ? `Up ${speakAmount(diff)}!` :
              diff < 0 ? `Down ${speakAmount(Math.abs(diff))}.` :
              "Same so far."
            }`,
          };
        }
        case "mgmt-payments":
          return {
            text: mgmt
              ? `Total payments recorded: ${speakAmount(mgmt.totalPaid)}.${
                  mgmt.todayPaidTotal > 0 ? ` Today: ${speakAmount(mgmt.todayPaidTotal)}.` : " None today."
                }`
              : "No payment data.",
          };

        // ══════════════════════════ MANAGEMENT: RIDERS ══════════════════════════
        case "mgmt-riders":
          return {
            text: mgmt
              ? `${plural(mgmt.riderCount, "rider")} total, ${mgmt.activeRiders} active. ${
                  mgmt.activeShifts > 0
                    ? `${plural(mgmt.activeShifts, "rider")} currently on shift.`
                    : "Nobody's on shift right now."
                }`
              : "No rider data.",
          };
        case "mgmt-remittance":
          return {
            text: mgmt
              ? `${speakAmount(mgmt.remitCollected)} collected today.${
                  mgmt.pending > 0 ? ` ${plural(mgmt.pending, "remittance")} still pending.` : " All confirmed!"
                }`
              : "No remittance data.",
          };
        case "mgmt-owe-riders":
          return {
            text: mgmt
              ? `You owe riders ${speakAmount(mgmt.riderPayables)}. Daily pay: ${speakAmount(mgmt.dailyPayTotal)}${
                  mgmt.bonusTotal > 0 ? `, bonuses: ${speakAmount(mgmt.bonusTotal)}` : ""
                }.`
              : "No payable data.",
          };
        case "mgmt-best-rider": {
          if (!mgmt) return { text: "No rider data." };
          if (!mgmt.bestRiderName) return { text: "No trips logged today to determine the top rider." };
          return {
            text: `Today's top performer is ${mgmt.bestRiderName} with ${speakAmount(mgmt.bestRiderEarnings)} earned! Let them know they're doing great.`,
          };
        }

        // ══════════════════════════ MANAGEMENT: FLEET & OPS ══════════════════════════
        case "mgmt-fleet":
          return {
            text: mgmt
              ? `Fleet: ${plural(mgmt.fleet, "tricycle")} with ${plural(mgmt.activeRiders, "active rider")}. ${
                  mgmt.pendingMaint > 0 ? `${plural(mgmt.pendingMaint, "pending maintenance item")}.` : "No pending maintenance."
                }${mgmt.expiringDocs > 0 ? ` ${plural(mgmt.expiringDocs, "document")} expiring within 30 days.` : ""}`
              : "No fleet data.",
          };
        case "mgmt-trips":
          return {
            text: mgmt ? `${plural(mgmt.trips, "trip")} completed today earning ${speakAmount(mgmt.revenue)}.${
              mgmt.yTrips > 0 ? ` Yesterday had ${plural(mgmt.yTrips, "trip")}.` : ""
            }` : "No trip data.",
          };
        case "mgmt-fuel":
          return {
            text: mgmt
              ? mgmt.fuelTotal > 0
                ? `Fleet fuel cost today: ${speakAmount(mgmt.fuelTotal)}.`
                : "No fuel logged today for the fleet."
              : "No fuel data.",
          };
        case "mgmt-maintenance":
          return {
            text: mgmt
              ? `Total maintenance costs: ${speakAmount(mgmt.totalMaintCost)}. ${
                  mgmt.pendingMaint > 0
                    ? `${plural(mgmt.pendingMaint, "item")} pending.`
                    : "Nothing pending."
                }${mgmt.recentMaint ? ` Last service: ${mgmt.recentMaint.service_type} on ${mgmt.recentMaint.date}.` : ""}`
              : "No maintenance data.",
          };
        case "mgmt-documents": {
          if (!mgmt) return { text: "No document data." };
          const parts = [];
          if (mgmt.expiredDocs > 0) parts.push(`${plural(mgmt.expiredDocs, "document")} EXPIRED`);
          if (mgmt.expiringDocs > 0) parts.push(`${plural(mgmt.expiringDocs, "document")} expiring within 30 days`);
          return {
            text: parts.length > 0
              ? `Document status: ${parts.join(". ")}. Check the fleet section to renew them.`
              : "All documents are up to date! No expirations coming up.",
          };
        }
        case "mgmt-efficiency": {
          if (!mgmt) return { text: "No data to calculate efficiency." };
          const util = mgmt.riderCount > 0
            ? Math.round((mgmt.activeShifts / mgmt.riderCount) * 100)
            : 0;
          const avgPerRider = mgmt.activeShifts > 0
            ? mgmt.revenue / mgmt.activeShifts
            : 0;
          return {
            text: `Fleet utilization: ${util}% (${mgmt.activeShifts} of ${mgmt.riderCount} riders on shift). ${
              avgPerRider > 0 ? `Average revenue per active rider: ${speakAmount(avgPerRider)}.` : ""
            }${mgmt.pendingMaint > 0 ? ` ${plural(mgmt.pendingMaint, "vehicle")} need maintenance.` : ""}`,
          };
        }

        // ══════════════════════════ MANAGEMENT: HR & COMPLIANCE ══════════════════════════
        case "mgmt-alerts": {
          if (!mgmt) return { text: "No alerts." };
          const alerts: string[] = [];
          if (mgmt.highIncidents > 0) alerts.push(`${plural(mgmt.highIncidents, "HIGH severity incident")}!`);
          if (mgmt.openIncidents > 0) alerts.push(`${plural(mgmt.openIncidents, "open incident")}`);
          if (mgmt.expiredDocs > 0) alerts.push(`${plural(mgmt.expiredDocs, "expired document")}`);
          if (mgmt.expiringDocs > 0) alerts.push(`${plural(mgmt.expiringDocs, "document")} expiring soon`);
          if (mgmt.pendingLeaves > 0) alerts.push(`${plural(mgmt.pendingLeaves, "leave request")} pending`);
          if (mgmt.pending > 0) alerts.push(`${plural(mgmt.pending, "remittance")} pending`);
          if (mgmt.pendingMaint > 0) alerts.push(`${plural(mgmt.pendingMaint, "maintenance item")} due`);
          if (mgmt.unreadMsgs > 0) alerts.push(`${plural(mgmt.unreadMsgs, "unread message")}`);
          return {
            text: alerts.length > 0
              ? `Attention! ${alerts.join(". ")}. Review your dashboard for details.`
              : "All clear! No alerts or issues to report. Everything is running smoothly.",
          };
        }
        case "mgmt-leave": {
          if (!mgmt) return { text: "No leave data." };
          if (mgmt.pendingLeaves === 0) return { text: "No pending leave requests. All caught up!" };
          const recent = Object.values(leaveRequests)
            .filter((l) => l.status === "pending")
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          const first = recent[0];
          return {
            text: `${plural(mgmt.pendingLeaves, "leave request")} pending.${
              first ? ` Most recent from ${first.rider_name}: "${first.reason}".` : ""
            } Review them in the HR section.`,
          };
        }
        case "mgmt-incidents": {
          if (!mgmt) return { text: "No incident data." };
          if (mgmt.openIncidents === 0) return { text: "No open incidents! All resolved." };
          const recent = Object.values(incidents)
            .filter((i) => i.status !== "resolved")
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          const latest = recent[0];
          return {
            text: `${plural(mgmt.openIncidents, "open incident")}.${
              mgmt.highIncidents > 0 ? ` ${mgmt.highIncidents} HIGH severity!` : ""
            }${latest ? ` Latest: ${latest.incident_type} by ${latest.rider_name} — "${latest.description}".` : ""
            } Review in the incidents section.`,
          };
        }
        case "mgmt-messages": {
          if (!mgmt) return { text: "No message data." };
          return {
            text: mgmt.unreadMsgs > 0
              ? `You have ${plural(mgmt.unreadMsgs, "unread message")}. Check your inbox to respond.`
              : "No unread messages. Inbox is clear!",
          };
        }
        case "mgmt-notifications": {
          if (!mgmt) return { text: "No notification data." };
          return {
            text: mgmt.unreadNotifs > 0
              ? `${plural(mgmt.unreadNotifs, "unread notification")}. Tap the bell to review them.`
              : "No unread notifications. You're all caught up!",
          };
        }

        // ══════════════════════════ MANAGEMENT: BRIEFING ══════════════════════════
        case "mgmt-briefing": {
          if (!mgmt) return { text: "No data for briefing yet." };
          const g = timeGreeting();
          const parts = [
            `${g}, boss! Here's your business briefing.`,
            `Revenue: ${speakAmount(mgmt.revenue)} from ${plural(mgmt.trips, "trip")}.${
              mgmt.yRevenue > 0 ? ` Yesterday was ${speakAmount(mgmt.yRevenue)}.` : ""
            }`,
            `Week total: ${speakAmount(mgmt.weekTotal)}.`,
            `${plural(mgmt.activeShifts, "rider")} on shift. ${plural(mgmt.riderCount, "rider")} total.`,
            `Remittances: ${speakAmount(mgmt.remitCollected)} collected.${mgmt.pending > 0 ? ` ${mgmt.pending} pending.` : ""}`,
            `Rider payables: ${speakAmount(mgmt.riderPayables)}.`,
            mgmt.todayExpTotal > 0 ? `Today's expenses: ${speakAmount(mgmt.todayExpTotal)}.` : "",
            `Profit: ${speakAmount(mgmt.profit)}.`,
            mgmt.openIncidents > 0 ? `${plural(mgmt.openIncidents, "open incident")}${mgmt.highIncidents > 0 ? ` (${mgmt.highIncidents} HIGH!)` : ""}.` : "",
            mgmt.pendingLeaves > 0 ? `${plural(mgmt.pendingLeaves, "leave request")} pending.` : "",
            mgmt.expiringDocs > 0 ? `${plural(mgmt.expiringDocs, "document")} expiring soon.` : "",
            mgmt.unreadMsgs > 0 ? `${plural(mgmt.unreadMsgs, "unread message")}.` : "",
            mgmt.bestRiderName ? `Top rider: ${mgmt.bestRiderName} (${speakAmount(mgmt.bestRiderEarnings)}).` : "",
            "That's your briefing! Ask me anything for more details.",
          ];
          return { text: parts.filter(Boolean).join(" ") };
        }

        default:
          return { text: `Sorry ${name}, I couldn't process that. Say "help" for the full command list.` };
      }
    },
    [
      user, role, isShiftActive, isOnline, clockInTime, todayEarnings, tripCount,
      dailyTarget, riderDailyPay, riderMonthlySalary, todayBonus, todayRiderTotal,
      progress, fare, pax, mgmt, riderData, dailyLogs, expenses, leaveRequests, incidents,
      doStartShift, doEndShift, doGoOnline, doGoOffline, doLogTrip, doLogFuel,
      doReportIncident, doRequestLeave, doSendMessage,
    ]
  );

  // ─── Quick Actions ───
  const quickActions = useMemo(() => {
    if (role === "rider") {
      if (!isShiftActive) return ["Start Shift", "My Earnings", "Help"];
      return ["Log Trip", isOnline ? "Go Offline" : "Go Online", "Earnings", "End Shift"];
    }
    if (role === "owner") {
      return ["Briefing", "Revenue", "Riders", "Alerts", "Trips"];
    }
    return ["Help"];
  }, [role, isShiftActive, isOnline]);

  // ─── Voice event handlers ───
  useEffect(() => {
    supported.current = isVoiceSupported();
    preloadVoices();
  }, []);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const executeVoiceCommand = useCallback(async (text: string) => {
    addChat("user", text);
    setState("processing");

    const result = await processCommand(text);
    lastResponseRef.current = result.text;
    addChat("monty", result.text);

    if (result.action) {
      result.action()
        .then(() => {
          if (user?.id) loadTodayData(user.id);
          toast.success("Done via Hey Monty!");
        })
        .catch(() => toast.error("Action failed. Please try again."));
    }

    setState("speaking");
    speak(result.text, () => {
      setState("idle");
      clearHideTimer();
      hideTimer.current = setTimeout(() => {
        if (stateRef.current === "idle") setShowPanel(false);
      }, 8000);
    });
  }, [processCommand, addChat, user?.id, loadTodayData]);

  const handleTap = useCallback(() => {
    if (state === "listening" || state === "speaking" || state === "processing") {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      stopSpeaking();
      setState("idle");
      clearHideTimer();
      hideTimer.current = setTimeout(() => setShowPanel(false), 2000);
      return;
    }

    if (!supported.current) {
      toast.error("Voice isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    setState("listening");
    setTranscript("");
    setInterim("");
    setShowPanel(true);
    setExpanded(true);
    clearHideTimer();

    recognitionRef.current = startRecognition({
      onInterim: (text) => setInterim(text),
      onFinal: async (text) => {
        setTranscript(text);
        setInterim("");
        await executeVoiceCommand(text);
      },
      onEnd: () => {
        if (stateRef.current === "listening") {
          addChat("monty", "I didn't hear anything. Tap the mic or use a quick action.");
          setState("idle");
          clearHideTimer();
          hideTimer.current = setTimeout(() => setShowPanel(false), 4000);
        }
      },
      onError: (error) => {
        if (error === "not-allowed") {
          toast.error("Microphone access denied. Allow it in browser settings.");
        } else if (error !== "no-speech" && error !== "aborted") {
          toast.error("Voice error. Please try again.");
        }
        setState("idle");
        clearHideTimer();
        hideTimer.current = setTimeout(() => setShowPanel(false), 3000);
      },
    });
  }, [state, executeVoiceCommand, addChat]);

  const handleQuickAction = useCallback((label: string) => {
    clearHideTimer();
    executeVoiceCommand(label);
  }, [executeVoiceCommand]);

  // Cleanup
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopSpeaking();
      clearHideTimer();
    };
  }, []);

  if (!user) return null;

  return (
    <MontyUI
      state={state}
      showPanel={showPanel}
      setShowPanel={setShowPanel}
      setState={setState}
      expanded={expanded}
      setExpanded={setExpanded}
      handleTap={handleTap}
      handleQuickAction={handleQuickAction}
      recognitionRef={recognitionRef}
      transcript={transcript}
      interim={interim}
      chat={chat}
      quickActions={quickActions}
      commandCount={COMMANDS.filter((c) => c.roles.includes(role)).length}
    />
  );
}

// ─── Chat-Style Panel + Draggable FAB ───
function MontyUI({
  state, showPanel, setShowPanel, setState, expanded, setExpanded,
  handleTap, handleQuickAction, recognitionRef, transcript, interim, chat, quickActions, commandCount,
}: {
  state: BotState;
  showPanel: boolean;
  setShowPanel: (v: boolean) => void;
  setState: (v: BotState) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  handleTap: () => void;
  handleQuickAction: (label: string) => void;
  recognitionRef: React.RefObject<{ stop: () => void } | null>;
  transcript: string;
  interim: string;
  chat: ChatMsg[];
  quickActions: string[];
  commandCount: number;
}) {
  const [pos, setPos] = useState({ bottom: 96, right: 16 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, bottom: 0, right: 0 });
  const moved = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Drag handlers
  const onDragStart = useCallback((clientX: number, clientY: number) => {
    dragging.current = true;
    moved.current = false;
    dragStart.current = { x: clientX, y: clientY, bottom: pos.bottom, right: pos.right };
  }, [pos]);

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current) return;
    const dx = dragStart.current.x - clientX;
    const dy = dragStart.current.y - clientY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
    if (!moved.current) return;
    setPos({
      bottom: Math.max(4, Math.min(window.innerHeight - 40, dragStart.current.bottom + dy)),
      right: Math.max(4, Math.min(window.innerWidth - 40, dragStart.current.right + dx)),
    });
  }, []);

  const onDragEnd = useCallback(() => { dragging.current = false; }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    onDragStart(e.touches[0].clientX, e.touches[0].clientY);
  }, [onDragStart]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    if (moved.current) e.preventDefault();
  }, [onDragMove]);
  const handleTouchEnd = useCallback(() => onDragEnd(), [onDragEnd]);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onDragStart(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => onDragMove(ev.clientX, ev.clientY);
    const onUp = () => { onDragEnd(); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onDragStart, onDragMove, onDragEnd]);
  const handleClick = useCallback(() => { if (!moved.current) handleTap(); }, [handleTap]);

  // Panel positioning
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 9999,
    width: 320,
    maxWidth: "calc(100vw - 1.5rem)",
  };
  if (pos.bottom > 200) {
    panelStyle.bottom = pos.bottom + 52;
  } else {
    panelStyle.top = window.innerHeight - pos.bottom + 8;
  }
  if (pos.right < window.innerWidth / 2) {
    panelStyle.right = Math.max(8, pos.right - 40);
  } else {
    panelStyle.right = Math.max(8, pos.right - 250);
  }

  return (
    <>
      {/* ── Chat Panel ── */}
      {showPanel && (
        <div style={panelStyle} className="animate-fade-in">
          <div className="rounded-2xl bg-white/95 dark:bg-surface-800/95 backdrop-blur-xl shadow-2xl shadow-black/20 border border-gray-200/50 dark:border-surface-600/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-linear-to-r from-bolt/10 to-bolt-dark/10 dark:from-bolt/5 dark:to-bolt-dark/5 border-b border-gray-100 dark:border-surface-700/50">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-linear-to-br from-bolt to-bolt-dark flex items-center justify-center shadow-sm shadow-bolt/20">
                  <span className="text-[11px] font-black text-white">M</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 leading-none">Hey Monty</p>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-none mt-0.5">
                    {state === "listening" ? "Listening..." :
                     state === "processing" ? "Thinking..." :
                     state === "speaking" ? "Speaking..." :
                     `${commandCount} commands ready`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors"
                >
                  <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${expanded ? "" : "rotate-180"}`} />
                </button>
                <button
                  onClick={() => {
                    setShowPanel(false);
                    setState("idle");
                    stopSpeaking();
                    recognitionRef.current?.stop();
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              </div>
            </div>

            {expanded && (
              <>
                {/* Chat messages */}
                <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin">
                  {chat.length === 0 && state !== "listening" && (
                    <div className="text-center py-4">
                      <MessageCircle className="h-6 w-6 text-gray-300 dark:text-surface-600 mx-auto mb-1.5" />
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">Tap the mic or use a quick action</p>
                    </div>
                  )}

                  {chat.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "monty" && (
                        <div className="shrink-0 mr-1.5 mt-0.5">
                          <div className="h-5 w-5 rounded-md bg-linear-to-br from-bolt to-bolt-dark flex items-center justify-center">
                            <span className="text-[8px] font-black text-white">M</span>
                          </div>
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-xl px-2.5 py-1.5 ${
                          msg.role === "user"
                            ? "bg-bolt/10 dark:bg-bolt/20 text-gray-800 dark:text-gray-200"
                            : "bg-gray-50 dark:bg-surface-700/50 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <p className="text-[12px] leading-relaxed">{msg.text}</p>
                      </div>
                    </div>
                  ))}

                  {/* Listening / interim indicator */}
                  {state === "listening" && (
                    <div className="flex justify-start">
                      <div className="shrink-0 mr-1.5 mt-0.5">
                        <div className="h-5 w-5 rounded-md bg-danger flex items-center justify-center animate-pulse">
                          <Mic className="h-3 w-3 text-white" />
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-surface-700/50 rounded-xl px-2.5 py-1.5">
                        {interim ? (
                          <p className="text-[12px] text-gray-500 italic">{interim}...</p>
                        ) : (
                          <div className="flex items-center gap-0.5 py-1">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className="w-0.5 rounded-full bg-danger"
                                style={{
                                  height: "14px",
                                  animation: `voice-wave 0.7s ease-in-out ${i * 0.12}s infinite alternate`,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {state === "processing" && (
                    <div className="flex justify-start">
                      <div className="shrink-0 mr-1.5 mt-0.5">
                        <div className="h-5 w-5 rounded-md bg-gold flex items-center justify-center">
                          <Loader2 className="h-3 w-3 text-white animate-spin" />
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-surface-700/50 rounded-xl px-2.5 py-1.5">
                        <p className="text-[12px] text-gray-400">Thinking...</p>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Quick Actions */}
                <div className="px-3 py-2 border-t border-gray-100 dark:border-surface-700/50">
                  <div className="flex flex-wrap gap-1.5">
                    {quickActions.map((action) => (
                      <button
                        key={action}
                        onClick={() => handleQuickAction(action)}
                        disabled={state !== "idle"}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-surface-700 text-gray-600 dark:text-gray-300 hover:bg-bolt/10 hover:text-bolt dark:hover:bg-bolt/20 dark:hover:text-bolt transition-colors disabled:opacity-40"
                      >
                        <Zap className="h-2.5 w-2.5" />
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Floating Mic Button ── */}
      <button
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{
          position: "fixed",
          bottom: pos.bottom,
          right: pos.right,
          zIndex: 9998,
          touchAction: "none",
        }}
        className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-all duration-300 select-none ${
          dragging.current ? "cursor-grabbing" : "cursor-grab"
        } ${
          state === "listening"
            ? "bg-danger text-white shadow-danger/40 scale-110"
            : state === "speaking"
            ? "bg-bolt text-white shadow-bolt/40 scale-105"
            : state === "processing"
            ? "bg-gold text-white shadow-gold/40"
            : "bg-linear-to-br from-bolt to-bolt-dark text-white shadow-bolt/30"
        }`}
        aria-label={state === "listening" ? "Stop listening" : "Hey Monty — voice command"}
      >
        {state === "listening" ? (
          <MicOff className="h-4.5 w-4.5" />
        ) : state === "processing" ? (
          <Loader2 className="h-4.5 w-4.5 animate-spin" />
        ) : state === "speaking" ? (
          <Volume2 className="h-4.5 w-4.5" />
        ) : (
          <Mic className="h-4.5 w-4.5" />
        )}

        {/* Pulse rings */}
        {state === "listening" && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-danger animate-ping opacity-30" />
            <span className="absolute -inset-1 rounded-full border border-danger/20 animate-ping opacity-20" style={{ animationDelay: "0.3s" }} />
          </>
        )}

        {/* Notification dot when panel closed and there's chat */}
        {!showPanel && chat.length > 0 && state === "idle" && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-danger border-2 border-white dark:border-surface-900" />
        )}
      </button>

      {/* Status label */}
      {showPanel && state !== "idle" && (
        <div
          style={{
            position: "fixed",
            bottom: pos.bottom + 4,
            right: pos.right + 52,
            zIndex: 9997,
          }}
          className="pointer-events-none animate-fade-in"
        >
          <div className="rounded-md bg-surface-800/80 backdrop-blur-sm px-2 py-0.5 shadow-lg border border-surface-700/50">
            <span className="text-[9px] font-bold text-white whitespace-nowrap">
              {state === "listening" ? "Listening..." : state === "processing" ? "Thinking..." : "Speaking..."}
            </span>
          </div>
        </div>
      )}

      {/* Waveform keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes voice-wave {
              0% { height: 4px; opacity: 0.3; }
              100% { height: 18px; opacity: 1; }
            }
          `,
        }}
      />
    </>
  );
}
