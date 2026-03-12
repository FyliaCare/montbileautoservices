"use client";

import React, { useState, useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useShiftStore } from "@/stores/shift-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatCurrency, todayISO, uid } from "@/lib/utils";
import { DEFAULTS } from "@/lib/constants";
import { saveNotification } from "@/lib/firebase";
import { toast } from "sonner";
import { TrendingUp, Navigation, Calendar, Target, Wallet, BarChart3, Banknote, CheckCircle2, Clock } from "lucide-react";

type View = "daily" | "weekly" | "monthly";

export default function RiderEarningsPage() {
  const user = useAuthStore((s) => s.user);
  const { todayEarnings, tripCount } = useShiftStore(useShallow((s) => ({
    todayEarnings: s.todayEarnings,
    tripCount: s.tripCount,
  })));
  const { dailyLogs, settings, appRemittances, addRemittance } = useFirebaseStore(useShallow((s) => ({
    dailyLogs: s.dailyLogs,
    settings: s.settings,
    appRemittances: s.appRemittances,
    addRemittance: s.addRemittance,
  })));
  const [view, setView] = useState<View>("daily");
  const [showRemit, setShowRemit] = useState(false);
  const [remitAmount, setRemitAmount] = useState("");
  const [remitMethod, setRemitMethod] = useState("cash");

  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const riderMonthlySalary = settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary;
  const fare = settings?.fare || DEFAULTS.fare;
  const workingDays = settings?.wdays || 26;

  // Build weekly data (Mon–Sun)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekDays: Array<{ label: string; date: string; revenue: number }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLogs = Object.values(dailyLogs).filter((l) => l.date === dateStr && l.rider === user?.name);
    const revenue = dayLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
    weekDays.push({
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      date: dateStr,
      revenue,
    });
  }

  const weekTotal = weekDays.reduce((s, d) => s + d.revenue, 0);
  const maxDay = Math.max(...weekDays.map((d) => d.revenue), 1);

  // Monthly data
  const currentMonth = today.toISOString().slice(0, 7);
  const monthLogs = Object.values(dailyLogs).filter((l) => l.date.startsWith(currentMonth) && l.rider === user?.name);
  const monthTotal = monthLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
  const monthTrips = monthLogs.reduce((s, l) => s + (l.trips || 0), 0);
  const monthDays = monthLogs.length || 1;

  const progress = dailyTarget > 0 ? Math.min((todayEarnings / dailyTarget) * 100, 100) : 0;
  const progressReached = progress >= 100;

  // Today's remittance
  const todayDate = todayISO();
  const todayRemittance = useMemo(() =>
    Object.entries(appRemittances)
      .filter(([, r]) => r.remittance_date === todayDate && r.rider_id === user?.id)
      .map(([id, r]) => ({ ...r, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [appRemittances, todayDate, user?.id]
  );
  const todayRemittanceTotal = todayRemittance.reduce((s, r) => s + r.amount, 0);
  const hasSubmittedToday = todayRemittance.length > 0;

  const handleSubmitRemittance = async () => {
    if (!user) return;
    const amount = parseFloat(remitAmount) || 0;
    if (amount <= 0) { toast.error("Enter remittance amount"); return; }
    const remitId = uid("remit");
    try {
      await addRemittance(remitId, {
        rider_id: user.id,
        rider_name: user.name,
        tricycle_id: "tricycle-1",
        amount,
        expected_amount: todayEarnings,
        payment_method: remitMethod,
        status: "pending",
        remittance_date: todayDate,
        created_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "remittance_submitted",
        title: "Remittance Submitted",
        message: `${user.name} submitted ${formatCurrency(amount)} (${remitMethod})`,
        icon: "💵",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success(`Remittance submitted: ${formatCurrency(amount)}`);
    } catch {
      toast.error("Failed to submit remittance");
    }
    setShowRemit(false);
    setRemitAmount("");
  };

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
          <Wallet className="h-5 w-5 text-bolt" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Earnings</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Track your income</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        {(["daily", "weekly", "monthly"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-xl px-4 py-2 text-xs font-bold capitalize transition-all ${
              view === v
                ? "bg-bolt text-white shadow-lg shadow-bolt/25"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-400"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "daily" && (
        <div className="space-y-4 animate-fade-in">
          {/* Hero earnings card */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-5">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-bolt/10 blur-2xl" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-bolt/5 blur-xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Today&apos;s Earnings</p>
              <p className="mt-1 text-3xl font-black text-white tabular">{formatCurrency(todayEarnings)}</p>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-3.5 w-3.5 text-bolt" />
                  <span className="text-sm font-semibold text-gray-300 tabular">{tripCount} trips</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-gold" />
                  <span className="text-sm font-semibold text-gray-300 tabular">{formatCurrency(dailyTarget)} target</span>
                </div>
              </div>
              {/* Rider pay breakdown */}
              <div className="mt-3 border-t border-white/10 pt-3 flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-bolt" />
                  <span className="text-sm font-semibold text-gray-300 tabular">Pay: {formatCurrency(riderDailyPay)}</span>
                </div>
                {todayEarnings > dailyTarget && (
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-gold" />
                    <span className="text-sm font-semibold text-gold tabular">+{formatCurrency(todayEarnings - dailyTarget)} bonus</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-bolt" />
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Daily Target</p>
              </div>
              <span className={`text-sm font-black tabular ${progressReached ? "text-bolt" : "text-gold"}`}>
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  progressReached
                    ? "bg-linear-to-r from-bolt to-bolt-dark"
                    : "bg-linear-to-r from-gold to-gold-dark"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-medium text-gray-400">
              <span className="tabular">{formatCurrency(todayEarnings)}</span>
              <span className="tabular">{formatCurrency(dailyTarget)}</span>
            </div>
          </Card>

          {/* Per-trip info */}
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bolt/10">
                  <BarChart3 className="h-4 w-4 text-bolt" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Per Trip</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-white tabular">{formatCurrency(fare)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Avg/Trip</p>
                <p className="text-lg font-extrabold text-gray-900 dark:text-white tabular">
                  {tripCount > 0 ? formatCurrency(todayEarnings / tripCount) : formatCurrency(0)}
                </p>
              </div>
            </div>
          </Card>

          {/* Remittance Section */}
          <SectionHeader title="Daily Remittance" />
          <Card>
            {hasSubmittedToday ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-bolt" />
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Submitted Today</p>
                  </div>
                  <Badge variant={todayRemittance[0]?.status === "confirmed" ? "green" : "gold"}>
                    {todayRemittance[0]?.status === "confirmed" ? "Confirmed" : "Pending"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount</span>
                  <span className="text-lg font-black text-bolt tabular">{formatCurrency(todayRemittanceTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Expected (Total Earnings)</span>
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 tabular">{formatCurrency(todayEarnings)}</span>
                </div>
                {todayRemittanceTotal < todayEarnings && (
                  <Button onClick={() => { setRemitAmount(""); setShowRemit(true); }} variant="outline" size="sm" fullWidth>
                    Submit Additional
                  </Button>
                )}
                <div className="flex items-center gap-2 rounded-xl bg-bolt/10 p-2.5 mt-1">
                  <span className="text-sm">💰</span>
                  <p className="text-[11px] font-semibold text-bolt">Management owes you {formatCurrency(riderDailyPay + Math.max(0, todayEarnings - dailyTarget))}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-2">
                <Banknote className="h-8 w-8 text-gold mb-2" />
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Today&apos;s Earnings: {formatCurrency(todayEarnings)}
                </p>
                <p className="text-xs text-gray-400 mb-2">Submit all earnings — management pays you {formatCurrency(riderDailyPay)} daily + bonus</p>
                {todayEarnings > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-bolt/10 p-2.5 mb-3 w-full">
                    <span className="text-sm">💰</span>
                    <p className="text-[11px] font-semibold text-bolt">You&apos;ll receive: {formatCurrency(riderDailyPay + Math.max(0, todayEarnings - dailyTarget))}</p>
                  </div>
                )}
                <Button onClick={() => { setRemitAmount(todayEarnings > 0 ? String(todayEarnings) : ""); setShowRemit(true); }} variant="gold" size="lg" fullWidth
                  icon={<Banknote className="h-5 w-5" />}>
                  Submit Remittance
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {view === "weekly" && (
        <div className="space-y-4 animate-fade-in">
          {/* Hero weekly card */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-5">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-bolt/10 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">This Week</p>
              <p className="mt-1 text-3xl font-black text-white tabular">{formatCurrency(weekTotal)}</p>
              <p className="mt-1 text-sm text-gray-400">
                Avg <span className="font-bold text-bolt tabular">{formatCurrency(weekTotal / 7)}</span> / day
              </p>
            </div>
          </div>

          {/* Bar chart */}
          <Card>
            <SectionHeader title="Daily Breakdown" />
            <div className="flex items-end justify-between gap-2 h-36 mt-3">
              {weekDays.map((day) => {
                const height = maxDay > 0 ? (day.revenue / maxDay) * 100 : 0;
                const isToday = day.date === todayISO();
                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9px] font-bold text-gray-500 tabular">
                      {day.revenue > 0 ? `₵${Math.round(day.revenue)}` : ""}
                    </span>
                    <div
                      className={`w-full rounded-lg transition-all duration-500 ease-out ${
                        isToday
                          ? "bg-linear-to-t from-bolt-dark to-bolt shadow-sm shadow-bolt/30"
                          : day.revenue > 0
                            ? "bg-gray-200 dark:bg-surface-600"
                            : "bg-gray-100 dark:bg-surface-700"
                      }`}
                      style={{ height: `${Math.min(Math.max(height, 6), 100)}%` }}
                    />
                    <span className={`text-[10px] font-bold ${
                      isToday ? "text-bolt" : "text-gray-400"
                    }`}>
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {view === "monthly" && (
        <div className="space-y-4 animate-fade-in">
          {/* Hero monthly card */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-5">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-bolt/10 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Calendar className="mr-1 inline h-3.5 w-3.5" />
                {today.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </p>
              <p className="mt-1 text-3xl font-black text-white tabular">{formatCurrency(monthTotal)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Trips" value={monthTrips} color="bolt" />
            <StatCard label="Days Worked" value={monthDays} color="default" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Daily Avg" value={formatCurrency(monthTotal / monthDays)} color="gold" />
            <StatCard label="Per Trip" value={monthTrips > 0 ? formatCurrency(monthTotal / monthTrips) : formatCurrency(0)} color="default" />
          </div>

          {/* Monthly Salary Breakdown */}
          <SectionHeader title="Your Monthly Pay" />
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bolt/10">
                    <Wallet className="h-4 w-4 text-bolt" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Monthly Salary</p>
                    <p className="text-[11px] text-gray-400">Fixed monthly amount</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(riderMonthlySalary)}</span>
              </div>
              {monthTotal > dailyTarget * monthDays && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10">
                      <TrendingUp className="h-4 w-4 text-gold" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Bonuses Earned</p>
                      <p className="text-[11px] text-gray-400">From exceeding {formatCurrency(dailyTarget)} target</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gold tabular">+{formatCurrency(monthTotal - dailyTarget * monthDays)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 dark:border-surface-600 pt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Estimated Total</span>
                <span className="text-lg font-black text-bolt tabular">
                  {formatCurrency(
                    riderMonthlySalary +
                    Math.max(0, monthTotal - dailyTarget * monthDays)
                  )}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Remittance BottomSheet */}
      <BottomSheet open={showRemit} onClose={() => setShowRemit(false)} title="Submit Remittance">
        <div className="space-y-5 p-1">
          {/* Amount input */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">Amount (GH₵)</label>
            <input
              type="number"
              inputMode="decimal"
              value={remitAmount}
              onChange={(e) => setRemitAmount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-lg font-black text-gray-900 dark:text-white outline-none focus:border-bolt focus:ring-2 focus:ring-bolt/20 tabular"
              placeholder="0.00"
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 flex-wrap">
            {[todayEarnings, Math.round(todayEarnings * 0.75), Math.round(todayEarnings * 0.5)].filter(a => a > 0).map((amt) => (
              <button
                key={amt}
                onClick={() => setRemitAmount(String(amt))}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  parseFloat(remitAmount) === amt
                    ? "bg-bolt text-white shadow-lg shadow-bolt/25"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-400"
                }`}
              >
                ₵{amt}
              </button>
            ))}
          </div>

          {/* Payment method */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "cash", label: "💵 Cash" },
                { value: "momo", label: "📱 Mobile Money" },
              ].map((m) => (
                <button
                  key={m.value}
                  onClick={() => setRemitMethod(m.value)}
                  className={`rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                    remitMethod === m.value
                      ? "bg-bolt text-white shadow-lg shadow-bolt/25"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-400"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difference indicator */}
          {parseFloat(remitAmount) > 0 && todayEarnings > 0 && (
            <div className={`flex items-center justify-between rounded-xl p-3 ${
              parseFloat(remitAmount) >= todayEarnings
                ? "bg-bolt/10 text-bolt"
                : "bg-gold/10 text-gold-dark"
            }`}>
              <span className="text-xs font-bold">
                {parseFloat(remitAmount) >= todayEarnings ? "✅ Full earnings" : "⚠️ Partial submission"}
              </span>
              <span className="text-sm font-black tabular">
                {parseFloat(remitAmount) >= todayEarnings ? "+" : ""}
                {formatCurrency(parseFloat(remitAmount) - todayEarnings)}
              </span>
            </div>
          )}

          {/* Submit button */}
          <Button
            onClick={handleSubmitRemittance}
            variant="bolt"
            size="xl"
            fullWidth
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            Confirm Remittance — {remitAmount ? formatCurrency(parseFloat(remitAmount) || 0) : "₵0"}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
