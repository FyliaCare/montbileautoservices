"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useShiftStore } from "@/stores/shift-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useUIStore } from "@/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatCurrency, getInitials, todayISO } from "@/lib/utils";
import { DEFAULTS, ACHIEVEMENT_BADGES } from "@/lib/constants";
import { saveNotification } from "@/lib/firebase";
import { toast } from "sonner";
import {
  User, Navigation, Wallet, TrendingUp, Calendar,
  Banknote, Target, Sun, Moon, Monitor, Bell, Clock,
  LogOut, ChevronRight, Zap, Shield, Award, Star,
  FileText, AlertTriangle, CalendarDays
} from "lucide-react";

export default function RiderProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { tripCount, todayEarnings } = useShiftStore(useShallow((s) => ({
    tripCount: s.tripCount,
    todayEarnings: s.todayEarnings,
  })));
  const { settings, dailyLogs, appShifts, appRemittances, leaveRequests, addLeaveRequest } = useFirebaseStore(useShallow((s) => ({
    settings: s.settings,
    dailyLogs: s.dailyLogs,
    appShifts: s.appShifts,
    appRemittances: s.appRemittances,
    leaveRequests: s.leaveRequests,
    addLeaveRequest: s.addLeaveRequest,
  })));
  const { theme, setTheme, notificationsEnabled, toggleNotifications, shiftReminders, toggleShiftReminders } =
    useUIStore(useShallow((s) => ({
      theme: s.theme,
      setTheme: s.setTheme,
      notificationsEnabled: s.notificationsEnabled,
      toggleNotifications: s.toggleNotifications,
      shiftReminders: s.shiftReminders,
      toggleShiftReminders: s.toggleShiftReminders,
    })));
  const router = useRouter();

  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  if (!user) return null;

  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const riderMonthlySalary = settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary;
  const fare = settings?.fare || DEFAULTS.fare;
  const wage = settings?.wage || DEFAULTS.wage;
  const workingDays = settings?.wdays || 26;

  // Stats
  const riderLogs = Object.values(dailyLogs).filter((l) => l.rider === user.name);
  const totalLogs = riderLogs.length;
  const totalRevenue = riderLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
  const totalTrips = riderLogs.reduce((s, l) => s + (l.trips || 0), 0);
  const riderShifts = Object.values(appShifts).filter((s) => s.rider_id === user.id);
  const totalShifts = riderShifts.length;

  // ── Performance Score (0-100) ──
  const performanceScore = useMemo(() => {
    if (totalLogs === 0) return 0;
    // Revenue score: avg daily revenue vs target (max 30 pts)
    const avgRevenue = totalRevenue / totalLogs;
    const revenueScore = Math.min((avgRevenue / dailyTarget) * 30, 30);

    // Consistency score: days worked in last 30 days (max 25 pts)
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const recentLogs = riderLogs.filter((l) => l.date >= last30.toISOString().slice(0, 10));
    const consistencyScore = Math.min((recentLogs.length / 26) * 25, 25);

    // Punctuality score: shifts started before 7 AM (max 20 pts)
    const earlyShifts = riderShifts.filter((s) => {
      const hour = new Date(s.clock_in_time).getHours();
      return hour < 7;
    });
    const punctualityScore = totalShifts > 0 ? (earlyShifts.length / totalShifts) * 20 : 10;

    // Remittance score: on-time full payments (max 25 pts)
    const riderRemit = Object.values(appRemittances).filter((r) => r.rider_id === user.id);
    const fullPayments = riderRemit.filter((r) => r.amount >= (r.expected_amount || dailyTarget));
    const remitScore = riderRemit.length > 0 ? (fullPayments.length / riderRemit.length) * 25 : 12;

    return Math.round(revenueScore + consistencyScore + punctualityScore + remitScore);
  }, [totalLogs, totalRevenue, dailyTarget, riderLogs, riderShifts, totalShifts, appRemittances, user.id]);

  const scoreColor = performanceScore >= 80 ? "text-bolt" : performanceScore >= 60 ? "text-gold" : "text-danger";

  // ── Attendance Calendar ──
  const calendarData = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay(); // 0=Sun

    const approvedLeaves = Object.values(leaveRequests)
      .filter((l) => l.rider_id === user.id && l.status === "approved");

    const days: Array<{ date: number; status: "worked" | "absent" | "late" | "leave" | "future" | "none" }> = [];
    const today = new Date();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dateObj = new Date(year, month - 1, d);

      if (dateObj > today) {
        days.push({ date: d, status: "future" });
        continue;
      }

      const onLeave = approvedLeaves.some((l) => dateStr >= l.start_date && dateStr <= l.end_date);
      if (onLeave) {
        days.push({ date: d, status: "leave" });
        continue;
      }

      const dayShifts = riderShifts.filter((s) => s.clock_in_time.startsWith(dateStr));
      if (dayShifts.length > 0) {
        const lateShift = dayShifts.some((s) => new Date(s.clock_in_time).getHours() >= 8);
        days.push({ date: d, status: lateShift ? "late" : "worked" });
      } else {
        // Only mark absent for weekdays
        const isWeekend = dateObj.getDay() === 0; // Sunday
        days.push({ date: d, status: isWeekend ? "none" : "absent" });
      }
    }

    return { startWeekday, days, monthLabel: firstDay.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }, [calendarMonth, user.id, riderShifts, leaveRequests]);

  const statusColors: Record<string, string> = {
    worked: "bg-bolt text-white",
    absent: "bg-danger/20 text-danger",
    late: "bg-gold/20 text-gold-dark",
    leave: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    future: "bg-gray-50 text-gray-300 dark:bg-surface-700 dark:text-surface-500",
    none: "bg-gray-50 text-gray-300 dark:bg-surface-700 dark:text-surface-500",
  };

  // ── Achievement Badges ──
  const earnedBadges = useMemo(() => {
    const earned: string[] = [];

    // Early Bird: 5+ shifts starting before 6 AM
    const earlyCount = riderShifts.filter((s) => new Date(s.clock_in_time).getHours() < 6).length;
    if (earlyCount >= 5) earned.push("early_bird");

    // Iron Horse: 30+ days worked
    if (totalLogs >= 30) earned.push("iron_horse");

    // Century Rider: 100+ trips total 
    if (totalTrips >= 100) earned.push("century_rider");

    // Clean Machine: 14+ checklist all-passed
    const cleanCount = riderShifts.filter((s) => s.checklist?.all_passed).length;
    if (cleanCount >= 14) earned.push("clean_machine");

    // Zero Balance: all remittances full
    const riderRemit = Object.values(appRemittances).filter((r) => r.rider_id === user.id);
    const allFull = riderRemit.length > 0 && riderRemit.every((r) => r.amount >= (r.expected_amount || dailyTarget));
    if (allFull) earned.push("zero_balance");

    // Speed Logger: granted if any trips exist (simplified)
    if (totalTrips > 0) earned.push("speed_logger");

    // Top Earner: if avg daily > target
    if (totalLogs > 0 && totalRevenue / totalLogs >= dailyTarget) earned.push("top_earner");

    return earned;
  }, [riderShifts, totalLogs, totalTrips, appRemittances, user.id, dailyTarget, totalRevenue]);

  // ── Leave request ──
  const myLeaveRequests = useMemo(() =>
    Object.entries(leaveRequests)
      .filter(([, l]) => l.rider_id === user.id)
      .map(([id, l]) => ({ ...l, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [leaveRequests, user.id]
  );

  const handleSubmitLeave = async () => {
    if (!leaveStart || !leaveEnd || !leaveReason.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    try {
      await addLeaveRequest({
        rider_id: user.id,
        rider_name: user.name,
        start_date: leaveStart,
        end_date: leaveEnd,
        reason: leaveReason.trim(),
        status: "pending",
        created_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "leave_requested",
        title: "Leave Request",
        message: `${user.name} requested leave: ${leaveStart} to ${leaveEnd}`,
        icon: "📅",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success("Leave request submitted");
      setShowLeaveForm(false);
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveReason("");
    } catch {
      toast.error("Failed to submit request");
    }
  };

  const handleLogout = () => {
    // Clear shift data so next rider doesn't see this rider's data
    const { clearAll } = useShiftStore.getState();
    clearAll();
    logout();
    router.replace("/login");
  };

  const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Profile hero */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-6">
        <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-bolt/10 blur-2xl" />
        <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-gold/10 blur-xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-bolt to-bolt-dark text-2xl font-black text-white shadow-lg shadow-bolt/30">
            {getInitials(user.name)}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">{user.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="bolt" dot>Rider</Badge>
              <Badge variant="green" dot>Active</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Score */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                className="text-gray-100 dark:text-surface-700" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                strokeDasharray={264} strokeDashoffset={264 - (264 * performanceScore / 100)}
                strokeLinecap="round"
                className={scoreColor} />
            </svg>
            <span className={`absolute text-xl font-black tabular ${scoreColor}`}>{performanceScore}</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Performance Score</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {performanceScore >= 80 ? "Excellent! Keep it up 🌟" :
               performanceScore >= 60 ? "Good performance 👍" :
               "Room for improvement 💪"}
            </p>
            <div className="mt-2 flex gap-3 text-[10px] font-semibold text-gray-400">
              <span>Revenue</span>
              <span>•</span>
              <span>Punctuality</span>
              <span>•</span>
              <span>Consistency</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Today's stats */}
      <SectionHeader title="Today" />
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Earnings" value={formatCurrency(todayEarnings)} color="bolt" />
        <StatCard label="Trips" value={tripCount} color="gold" />
      </div>

      {/* All-time stats */}
      <SectionHeader title="All Time" />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Revenue" value={`₵${Math.round(totalRevenue)}`} color="bolt" />
        <StatCard label="Days" value={totalLogs} color="default" />
        <StatCard label="Shifts" value={totalShifts} color="default" />
      </div>

      {/* Achievement Badges */}
      <SectionHeader title={`Badges (${earnedBadges.length}/${ACHIEVEMENT_BADGES.length})`} />
      <div className="grid grid-cols-4 gap-2">
        {ACHIEVEMENT_BADGES.map((badge) => {
          const isEarned = earnedBadges.includes(badge.id);
          return (
            <div
              key={badge.id}
              className={`flex flex-col items-center rounded-xl p-2.5 text-center transition-all ${
                isEarned
                  ? "bg-bolt/10 shadow-sm"
                  : "bg-gray-50 opacity-40 grayscale dark:bg-surface-700"
              }`}
            >
              <span className="text-2xl">{badge.icon}</span>
              <p className="mt-1 text-[9px] font-bold text-gray-700 dark:text-gray-300 leading-tight">{badge.name}</p>
            </div>
          );
        })}
      </div>

      {/* Attendance Calendar */}
      <SectionHeader title="Attendance" />
      <Card>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
              setCalendarMonth(prev);
            }}
            className="rounded-lg px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-700"
          >
            ‹
          </button>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{calendarData.monthLabel}</p>
          <button
            onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
              setCalendarMonth(next);
            }}
            className="rounded-lg px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-700"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calendarData.startWeekday }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {calendarData.days.map((day) => (
            <div
              key={day.date}
              className={`flex h-8 w-full items-center justify-center rounded-lg text-[11px] font-bold ${statusColors[day.status]}`}
            >
              {day.date}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Worked", color: "bg-bolt" },
            { label: "Late", color: "bg-gold" },
            { label: "Absent", color: "bg-danger" },
            { label: "Leave", color: "bg-blue-400" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${item.color}`} />
              <span className="text-[10px] font-medium text-gray-400">{item.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Leave Requests */}
      <SectionHeader title="Time Off" />
      <Button onClick={() => setShowLeaveForm(true)} variant="outline" size="md" fullWidth
        icon={<CalendarDays className="h-4 w-4" />}>
        Request Leave
      </Button>
      {myLeaveRequests.length > 0 && (
        <div className="space-y-2 mt-2">
          {myLeaveRequests.slice(0, 3).map((req) => (
            <Card key={req.id} padding="sm" className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">{req.start_date} → {req.end_date}</p>
                <p className="text-[11px] text-gray-500">{req.reason}</p>
              </div>
              <Badge variant={req.status === "approved" ? "green" : req.status === "rejected" ? "red" : "gold"}>
                {req.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      {/* Business Info */}
      <SectionHeader title="Business Settings" />
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-surface-600">
          {[
            { label: "Daily Fare", value: `GH₵${fare}`, icon: Banknote, color: "text-bolt" },
            { label: "Daily Target", value: `GH₵${dailyTarget}`, icon: Target, color: "text-gold" },
            { label: "Your Daily Pay", value: `GH₵${riderDailyPay}`, icon: Wallet, color: "text-bolt" },
            { label: "Monthly Salary", value: `GH₵${riderMonthlySalary}`, icon: Wallet, color: "text-gold" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{item.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Preferences */}
      <SectionHeader title="Preferences" />
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
              <Bell className="h-4 w-4 text-bolt" />
            </div>
            <div className="flex-1">
              <Toggle
                checked={notificationsEnabled}
                onChange={toggleNotifications}
                label="Notifications"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
              <Clock className="h-4 w-4 text-gold" />
            </div>
            <div className="flex-1">
              <Toggle
                checked={shiftReminders}
                onChange={toggleShiftReminders}
                label="Shift Reminders"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
              <Sun className="h-4 w-4 text-gold" />
            </div>
            <div className="flex flex-1 items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</span>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-surface-700">
                {(["light", "dark", "system"] as const).map((t) => {
                  const Icon = themeIcons[t];
                  return (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                        theme === t
                          ? "bg-bolt text-white shadow-sm"
                          : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Logout */}
      <Button onClick={handleLogout} variant="danger" size="lg" className="w-full">
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>

      <div className="flex items-center justify-center gap-1 pb-4">
        <Zap className="h-3 w-3 text-bolt" />
        <p className="text-[10px] font-medium text-gray-400">Montbile Auto Services v2.0</p>
      </div>

      {/* Leave Request Form */}
      <BottomSheet open={showLeaveForm} onClose={() => setShowLeaveForm(false)} title="Request Leave">
        <div className="space-y-4 p-1">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Start Date</label>
            <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:border-bolt" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">End Date</label>
            <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:border-bolt" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Reason</label>
            <textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
              rows={3} placeholder="Why do you need time off?"
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-bolt resize-none" />
          </div>
          <Button onClick={handleSubmitLeave} variant="bolt" size="lg" fullWidth
            icon={<CalendarDays className="h-5 w-5" />}>
            Submit Request
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
