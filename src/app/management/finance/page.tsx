"use client";

import React, { useState, useMemo } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { EXPENSE_CATEGORIES, DEFAULTS } from "@/lib/constants";
import type { DailyLog, Expense, Payment, Remittance } from "@/lib/types";
import { toast } from "sonner";
import {
  Wallet, TrendingDown,
  Plus, CreditCard, Receipt,
  Banknote, ArrowDownRight, ArrowUpRight,
  CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp,
  Eye, CircleDollarSign, PiggyBank, CalendarDays,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// ─── Helpers ───
function c(n: number) { return formatCurrency(n); }
function dateLabel(d: string) {
  const today = todayISO();
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yest) return "Yesterday";
  return formatDate(d);
}

type Tab = "dashboard" | "days" | "expenses" | "payments" | "remittance";

export default function FinancePage() {
  const {
    dailyLogs, expenses, payments, riders, settings, appTrips, appShifts,
    appRemittances, editRemittance,
  } = useFirebaseStore(useShallow((s) => ({
    dailyLogs: s.dailyLogs,
    expenses: s.expenses,
    payments: s.payments,
    riders: s.riders,
    settings: s.settings,
    appTrips: s.appTrips,
    appShifts: s.appShifts,
    appRemittances: s.appRemittances,
    editRemittance: s.editRemittance,
  })));

  const [tab, setTab] = useState<Tab>("dashboard");
  const [sheet, setSheet] = useState<"daily" | "expense" | "payment" | null>(null);

  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.wage || DEFAULTS.riderDailyPay;

  // ─── Core numbers ───
  const numbers = useMemo(() => {
    // Revenue from daily logs
    const totalSales = Object.values(dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0);

    // Live today earnings from active shift
    const today = todayISO();
    const hasActiveShift = Object.values(appShifts).some(s => s.status === "active");
    const liveEarnings = hasActiveShift
      ? Object.values(appTrips).filter(t => t.created_at?.startsWith(today)).reduce((s, t) => s + (t.fare_amount || 0), 0)
      : 0;

    // Expenses — split running vs startup
    // Running = expenses on days the rider worked (fuel, transport etc — paid from sales)
    // Startup = expenses before operations began (tyres, gear etc — paid from capital)
    const opDates = new Set(Object.values(dailyLogs).map(l => l.date));
    let runningExpenses = 0;
    let startupExpenses = 0;
    Object.values(expenses).forEach(e => {
      if (opDates.has(e.date)) runningExpenses += e.amount || 0;
      else startupExpenses += e.amount || 0;
    });
    const totalExpenses = runningExpenses + startupExpenses;

    // Payments — separate capital from operational (wages)
    let capitalInvested = 0;
    let operationalPaid = 0;
    Object.values(payments).forEach(p => {
      const ref = ((p.reference || "") + (p.notes || "")).toLowerCase();
      if (ref.includes("capital") || ref.includes("startup") || ref.includes("investment") || ref.includes("seed")) {
        capitalInvested += p.amount || 0;
      } else {
        operationalPaid += p.amount || 0;
      }
    });

    // Remittances — cash actually handed to management
    const totalRemitted = Object.values(appRemittances).reduce((s, r) => s + (r.amount || 0), 0);
    const confirmedRemitted = Object.values(appRemittances)
      .filter(r => r.status === "confirmed")
      .reduce((s, r) => s + (r.amount || 0), 0);
    const pendingRemitted = Object.values(appRemittances)
      .filter(r => r.status === "pending")
      .reduce((s, r) => s + (r.amount || 0), 0);

    // CASH IN HAND = cash received from rider
    // Wages, fuel, transport are already deducted from sales by the rider before remitting
    const cashInHand = confirmedRemitted;

    // Days worked
    const daysWorked = Object.values(dailyLogs).length;

    return {
      totalSales,
      liveEarnings,
      totalExpenses,
      runningExpenses,
      startupExpenses,
      capitalInvested,
      operationalPaid,
      totalRemitted,
      confirmedRemitted,
      pendingRemitted,
      cashInHand,
      daysWorked,
    };
  }, [dailyLogs, expenses, payments, appRemittances, appTrips, appShifts]);

  // ─── Per-day breakdown ───
  const dailyBreakdown = useMemo(() => {
    const allDates = new Set<string>();
    Object.values(dailyLogs).forEach(l => allDates.add(l.date));
    Object.values(expenses).forEach(e => allDates.add(e.date));
    Object.values(payments).forEach(p => allDates.add(p.date));
    Object.values(appRemittances).forEach(r => allDates.add(r.remittance_date));

    return Array.from(allDates).sort((a, b) => b.localeCompare(a)).map(date => {
      const logs = Object.values(dailyLogs).filter(l => l.date === date);
      const dayExp = Object.values(expenses).filter(e => e.date === date);
      const dayPay = Object.values(payments).filter(p => p.date === date);
      const dayRemit = Object.values(appRemittances).filter(r => r.remittance_date === date);

      const sales = logs.reduce((s, l) => s + (l.total_revenue || 0), 0);
      const fuel = logs.reduce((s, l) => s + (l.fuel_cost || 0), 0);
      const trips = logs.reduce((s, l) => s + (l.trips || 0), 0);
      const exp = dayExp.reduce((s, e) => s + (e.amount || 0), 0);
      const wagePaid = dayPay.filter(p => {
        const ref = ((p.reference || "") + (p.notes || "")).toLowerCase();
        return !ref.includes("capital") && !ref.includes("startup") && !ref.includes("investment");
      }).reduce((s, p) => s + (p.amount || 0), 0);
      const remitted = dayRemit.reduce((s, r) => s + (r.amount || 0), 0);
      const rider = logs[0]?.rider || "";
      const notes = logs[0]?.notes || "";

      return { date, sales, fuel, trips, exp, wagePaid, remitted, rider, notes, expenses: dayExp, payments: dayPay, remittances: dayRemit };
    });
  }, [dailyLogs, expenses, payments, appRemittances]);

  // Expense breakdown for pie chart
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {};
    Object.values(expenses).forEach(e => {
      byCategory[e.category || "Other"] = (byCategory[e.category || "Other"] || 0) + e.amount;
    });
    return Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "dashboard", label: "Dashboard", icon: Eye },
    { key: "days", label: "Daily", icon: CalendarDays },
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "payments", label: "Payments", icon: CreditCard },
    { key: "remittance", label: "Remit", icon: Banknote },
  ];

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
          <Wallet className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Finance</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">See exactly where every cedi is</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-surface-700 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-bold transition-all whitespace-nowrap ${
                tab === t.key
                  ? "bg-white text-gray-900 shadow-sm dark:bg-surface-600 dark:text-white"
                  : "text-gray-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ══════════ DASHBOARD TAB ══════════ */}
      {tab === "dashboard" && (
        <DashboardTab
          numbers={numbers}
          dailyBreakdown={dailyBreakdown}
          expenseBreakdown={expenseBreakdown}
          dailyTarget={dailyTarget}
          riderDailyPay={riderDailyPay}
        />
      )}

      {/* ══════════ DAILY TAB ══════════ */}
      {tab === "days" && (
        <DailyTab
          breakdown={dailyBreakdown}
          dailyTarget={dailyTarget}
          riderDailyPay={riderDailyPay}
          onAddLog={() => setSheet("daily")}
        />
      )}

      {/* ══════════ EXPENSES TAB ══════════ */}
      {tab === "expenses" && (
        <ExpensesTab expenses={expenses} onAdd={() => setSheet("expense")} />
      )}

      {/* ══════════ PAYMENTS TAB ══════════ */}
      {tab === "payments" && (
        <PaymentsTab payments={payments} onAdd={() => setSheet("payment")} />
      )}

      {/* ══════════ REMITTANCE TAB ══════════ */}
      {tab === "remittance" && (
        <RemittanceTab remittances={appRemittances} editRemittance={editRemittance} settings={settings} />
      )}

      {/* ══════════ ADD FORMS ══════════ */}
      {sheet === "daily" && <AddDailyLogSheet riders={riders} settings={settings} onClose={() => setSheet(null)} />}
      {sheet === "expense" && <AddExpenseSheet onClose={() => setSheet(null)} />}
      {sheet === "payment" && <AddPaymentSheet riders={riders} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD TAB — The #1 screen management needs
   "Where is my money and how is the business doing?"
   ═══════════════════════════════════════════════════════════ */
const PIE_COLORS = ["#F5A623", "#34D399", "#3B82F6", "#EF4444", "#A855F7", "#EC4899", "#F97316", "#14B8A6"];

interface DayBreakdown {
  date: string;
  sales: number;
  fuel: number;
  trips: number;
  exp: number;
  wagePaid: number;
  remitted: number;
  rider: string;
  notes: string;
  expenses: Expense[];
  payments: Payment[];
  remittances: Remittance[];
}

function DashboardTab({
  numbers,
  dailyBreakdown,
  expenseBreakdown,
  dailyTarget,
  riderDailyPay,
}: {
  numbers: {
    totalSales: number; liveEarnings: number; totalExpenses: number;
    runningExpenses: number; startupExpenses: number;
    capitalInvested: number; operationalPaid: number; totalRemitted: number;
    confirmedRemitted: number; pendingRemitted: number; cashInHand: number; daysWorked: number;
  };
  dailyBreakdown: DayBreakdown[];
  expenseBreakdown: Array<{ name: string; value: number }>;
  dailyTarget: number;
  riderDailyPay: number;
}) {
  return (
    <div className="space-y-4 animate-fade-in">

      {/* ★ THE BIG ANSWER: How much cash should be in account/bag? */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-emerald-600 to-emerald-800 p-5 shadow-lg">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <PiggyBank className="h-5 w-5 text-emerald-200" />
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-200">Cash In Account</p>
          </div>
          <p className="text-4xl font-black text-white tabular">{c(numbers.cashInHand)}</p>
          <p className="mt-2 text-[11px] text-emerald-200/80 leading-relaxed">
            This is the money you should have right now.
            <br/>Total cash received from rider. Fuel, transport &amp; wages are already deducted from sales before the rider hands you cash.
          </p>
          {numbers.pendingRemitted > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
              <Clock className="h-3.5 w-3.5 text-yellow-300" />
              <p className="text-[11px] font-semibold text-yellow-200">
                {c(numbers.pendingRemitted)} pending confirmation
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ★ Money Flow — IN vs OUT */}
      <SectionHeader title="Money Flow" />
      <div className="grid grid-cols-2 gap-3">
        {/* Money IN */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Money In</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Sales</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular">{c(numbers.totalSales)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cash Received</p>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular">{c(numbers.confirmedRemitted)}</p>
          </div>
          {numbers.liveEarnings > 0 && (
            <div>
              <p className="text-xs text-gray-500">Live Today</p>
              <p className="text-sm font-bold text-emerald-500 tabular animate-pulse">{c(numbers.liveEarnings)}</p>
            </div>
          )}
        </div>

        {/* Money OUT */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-red-500" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Money Out</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Running Costs</p>
            <p className="text-lg font-black text-red-600 dark:text-red-400 tabular">{c(numbers.runningExpenses + numbers.operationalPaid)}</p>
            <p className="text-[9px] text-gray-400">fuel, transport, wages</p>
          </div>
          {numbers.startupExpenses > 0 && (
            <div>
              <p className="text-xs text-gray-500">Startup Costs</p>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular">{c(numbers.startupExpenses)}</p>
              <p className="text-[9px] text-gray-400">tyres, gear, initial fuel</p>
            </div>
          )}
        </div>
      </div>

      {/* ★ Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Days</p>
          <p className="text-xl font-black text-gray-900 dark:text-white">{numbers.daysWorked}</p>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Avg/Day</p>
          <p className="text-xl font-black text-gold tabular">
            {numbers.daysWorked > 0 ? c(Math.round(numbers.totalSales / numbers.daysWorked)) : "\u2014"}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Target</p>
          <p className="text-xl font-black text-gray-900 dark:text-white">{c(dailyTarget)}</p>
        </div>
      </div>

      {/* ★ Recent Days — at a glance */}
      <SectionHeader title="Recent Days" />
      {dailyBreakdown.slice(0, 5).map(day => (
        <DayCard key={day.date} day={day} dailyTarget={dailyTarget} riderDailyPay={riderDailyPay} />
      ))}

      {/* ★ Where Money Goes (Expense Pie) */}
      {expenseBreakdown.length > 0 && (
        <>
          <SectionHeader title="Where Money Goes" />
          <Card>
            <div className="flex items-center gap-4">
              <div className="h-28 w-28 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={24} outerRadius={50} paddingAngle={2} strokeWidth={0}>
                      {expenseBreakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#1F2937", border: "none", borderRadius: "12px",
                        fontSize: "11px", fontWeight: 700, color: "#fff", padding: "6px 10px",
                      }}
                      formatter={(value) => [c(Number(value)), ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {expenseBreakdown.slice(0, 5).map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate max-w-24">{item.name}</span>
                    </div>
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 tabular">{c(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ★ Capital Investment */}
      {numbers.capitalInvested > 0 && (
        <Card className="border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Capital Invested</p>
                <p className="text-[10px] text-gray-400">Startup & seed funding</p>
              </div>
            </div>
            <p className="text-lg font-black text-blue-500 tabular">{c(numbers.capitalInvested)}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Day Card — shows one day's story clearly ─── */
function DayCard({ day, dailyTarget, riderDailyPay }: { day: DayBreakdown; dailyTarget: number; riderDailyPay: number }) {
  const [open, setOpen] = useState(false);
  const hitTarget = day.sales >= dailyTarget;

  return (
    <Card padding="sm" className="space-y-0">
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${hitTarget ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
              <CalendarDays className={`h-5 w-5 ${hitTarget ? "text-emerald-500" : "text-amber-500"}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{dateLabel(day.date)}</p>
              <p className="text-[11px] text-gray-500">
                {day.trips > 0 && `${day.trips} trips \u2022 `}
                {day.rider && <span className="text-gray-400">{day.rider.split(" ")[0]}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular">{c(day.sales)}</p>
              <p className="text-[10px] text-gray-400">sales</p>
            </div>
            {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-surface-600 space-y-2 text-sm">
          <DayRow emoji="💰" label="Total Sales" amount={day.sales} color="text-emerald-600 dark:text-emerald-400" />
          {day.expenses.length > 0 && (
            <div>
              <DayRow emoji="📤" label="Expenses" amount={-day.exp} color="text-red-500" />
              {day.expenses.map((e, i) => (
                <p key={i} className="text-[10px] text-gray-400 ml-8">
                  {e.category}: {c(e.amount)} — {e.description}
                </p>
              ))}
            </div>
          )}
          {day.wagePaid > 0 && <DayRow emoji="👤" label="Rider Wage Paid" amount={-day.wagePaid} color="text-orange-500" />}
          <div className="border-t border-dashed border-gray-200 dark:border-surface-600 pt-2">
            <DayRow emoji="🏦" label="Cash Brought to Office" amount={day.remitted} color="text-blue-600 dark:text-blue-400" bold />
          </div>

          {/* Shortfall explanation */}
          {day.sales > 0 && day.remitted > 0 && day.remitted < day.sales && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 mt-1">
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                {"💡"} {c(day.sales - day.remitted)} deducted from sales
                {day.exp > 0 ? ` (expenses ${c(day.exp)})` : ""}
                {day.wagePaid > 0 ? ` + wage ${c(day.wagePaid)}` : ""}
              </p>
            </div>
          )}

          {day.notes && (
            <p className="text-[10px] text-gray-400 italic ml-2 mt-1">{"📝"} {day.notes}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function DayRow({ emoji, label, amount, color, bold }: { emoji: string; label: string; amount: number; color: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-bold" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{emoji}</span>
        <span className={`text-[12px] ${bold ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400"}`}>{label}</span>
      </div>
      <span className={`text-[12px] font-bold tabular ${color}`}>
        {amount < 0 ? `\u2212${c(Math.abs(amount))}` : c(amount)}
      </span>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   DAILY TAB — Expandable day-by-day view
   ═══════════════════════════════════════════════════════════ */
function DailyTab({
  breakdown,
  dailyTarget,
  riderDailyPay,
  onAddLog,
}: {
  breakdown: DayBreakdown[];
  dailyTarget: number;
  riderDailyPay: number;
  onAddLog: () => void;
}) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Day by Day (${breakdown.length})`} />
        <Button size="sm" variant="bolt" onClick={onAddLog}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Log
        </Button>
      </div>

      {/* Running total */}
      {breakdown.length > 0 && (
        <Card className="bg-linear-to-r from-emerald-500/10 to-transparent">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500">Running Total (all days)</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular">
              {c(breakdown.reduce((s, d) => s + d.sales, 0))}
            </p>
          </div>
        </Card>
      )}

      {breakdown.length === 0 ? (
        <EmptyState title="No days recorded" message="Add your first daily log" />
      ) : (
        breakdown.map(day => (
          <DayCard key={day.date} day={day} dailyTarget={dailyTarget} riderDailyPay={riderDailyPay} />
        ))
      )}
    </div>
  );
}

/* ─── Expenses Tab ─── */
function ExpensesTab({
  expenses,
  onAdd,
}: {
  expenses: Record<string, Expense>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(expenses)
    .map(([id, e]) => ({ ...e, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalExp = sorted.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Expenses (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Expense
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10">
              <TrendingDown className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Spent</p>
              <p className="text-xl font-black text-danger tabular">{c(totalExp)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No expenses" message="Track your first expense" />
      ) : (
        <div className="space-y-2">
          {sorted.map((exp) => (
            <Card key={exp.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10">
                  <Receipt className="h-4 w-4 text-danger" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{exp.description}</p>
                  <p className="text-[11px] text-gray-500">
                    {dateLabel(exp.date)} • <Badge variant="gray">{exp.category}</Badge>
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-danger tabular">{c(exp.amount)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Payments Tab ─── */
function PaymentsTab({
  payments,
  onAdd,
}: {
  payments: Record<string, Payment>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(payments)
    .map(([id, p]) => ({ ...p, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPay = sorted.reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Payments (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Payment
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-bolt/10 to-bolt/5 border border-bolt/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
              <Banknote className="h-5 w-5 text-bolt" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Paid</p>
              <p className="text-xl font-black text-bolt tabular">{c(totalPay)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No payments" message="Record your first payment" />
      ) : (
        <div className="space-y-2">
          {sorted.map((pay) => (
            <Card key={pay.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bolt/10">
                  <CreditCard className="h-4 w-4 text-bolt" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{pay.reference || "Payment"}</p>
                  <p className="text-[11px] text-gray-500">
                    {dateLabel(pay.date)} • {pay.method}
                    {pay.notes && ` • ${pay.notes}`}
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-bolt tabular">{c(pay.amount)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Add Daily Log Sheet ─── */
function AddDailyLogSheet({
  riders,
  settings,
  onClose,
}: {
  riders: Record<string, import("@/lib/types").Rider>;
  settings: import("@/lib/types").Settings | null;
  onClose: () => void;
}) {
  const { addDailyLog, addNotification } = useFirebaseStore(useShallow((s) => ({
    addDailyLog: s.addDailyLog,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const riderList = Object.entries(riders).map(([id, r]) => ({
    value: r.name,
    label: r.name,
  }));

  const fare = settings?.fare || DEFAULTS.fare;
  const pax = settings?.pax || DEFAULTS.pax;

  const [form, setForm] = useState({
    rider: riderList[0]?.value || "",
    trips: "",
    fuel_cost: "",
    date: todayISO(),
  });

  const trips = parseInt(form.trips) || 0;
  const fuelCost = parseFloat(form.fuel_cost) || 0;
  const revenue = trips * fare * pax;
  const remittance = settings?.remit_d || DEFAULTS.dailyTarget;

  async function handleSave() {
    if (!form.rider || trips <= 0) {
      toast.error("Enter rider and trips");
      return;
    }
    setSaving(true);
    try {
      const log: DailyLog = {
        rider: form.rider,
        date: form.date,
        bike: 1,
        trips,
        fare,
        passengers: pax,
        fare_revenue: revenue,
        extra_income: 0,
        total_revenue: revenue,
        fuel_cost: fuelCost,
        notes: "",
      };
      await addDailyLog(log);
      await addNotification({
        type: "daily_log_submitted",
        title: "Daily Log Added",
        message: `${form.rider}: ${trips} trips, ${formatCurrency(revenue)}`,
        icon: "📋",
        target_role: "all",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Daily log added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Daily Log">
      <div className="space-y-4 p-4">
        <Select
          label="Rider"
          value={form.rider}
          onChange={(e) => setForm({ ...form, rider: e.target.value })}
          options={riderList}
        />
        <Input
          label="Trips"
          type="number"
          value={form.trips}
          onChange={(e) => setForm({ ...form, trips: e.target.value })}
          placeholder="Number of trips"
        />
        <Input
          label="Fuel Cost (GH₵)"
          type="number"
          value={form.fuel_cost}
          onChange={(e) => setForm({ ...form, fuel_cost: e.target.value })}
          placeholder="0.00"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />

        {/* Preview */}
        <Card className="bg-gray-50 dark:bg-surface-700">
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Revenue</span>
            <span className="font-bold text-gold tabular">{formatCurrency(revenue)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-500">Remittance</span>
            <span className="font-bold tabular">{formatCurrency(remittance)}</span>
          </div>
        </Card>

        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Daily Log
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Add Expense Sheet ─── */
function AddExpenseSheet({ onClose }: { onClose: () => void }) {
  const { addExpense, addNotification } = useFirebaseStore(useShallow((s) => ({
    addExpense: s.addExpense,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: EXPENSE_CATEGORIES[0] as string,
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.description || !form.amount) {
      toast.error("Fill in all fields");
      return;
    }
    setSaving(true);
    try {
      const expense: Expense = {
        description: form.description,
        amount: parseFloat(form.amount),
        category: form.category,
        date: form.date,
        payment_method: "cash",
        recorded_by: "management",
      };
      await addExpense(expense);
      await addNotification({
        type: "expense_added",
        title: "Expense Recorded",
        message: `${form.category}: ${formatCurrency(expense.amount)} — ${form.description}`,
        icon: "💸",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Expense added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Expense">
      <div className="space-y-4 p-4">
        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What was the expense for?"
        />
        <Input
          label="Amount (GH₵)"
          type="number"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
        />
        <Select
          label="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Expense
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Add Payment Sheet ─── */
function AddPaymentSheet({
  riders,
  onClose,
}: {
  riders: Record<string, import("@/lib/types").Rider>;
  onClose: () => void;
}) {
  const { addPayment, addNotification } = useFirebaseStore(useShallow((s) => ({
    addPayment: s.addPayment,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const riderList = Object.entries(riders).map(([, r]) => ({
    value: r.name,
    label: r.name,
  }));

  const [form, setForm] = useState({
    rider: riderList[0]?.value || "",
    amount: "",
    type: "salary",
    note: "",
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.rider || !form.amount) {
      toast.error("Fill in rider and amount");
      return;
    }
    setSaving(true);
    try {
      const payment: Payment = {
        amount: parseFloat(form.amount),
        method: form.type,
        reference: form.rider,
        notes: form.note,
        date: form.date,
        recorded_by: "management",
      };
      await addPayment(payment);
      await addNotification({
        type: "payment_recorded",
        title: "Payment Made",
        message: `${form.rider}: ${formatCurrency(payment.amount)} (${form.type})`,
        icon: "💰",
        target_role: "all",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Payment recorded");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Payment">
      <div className="space-y-4 p-4">
        <Select
          label="Rider"
          value={form.rider}
          onChange={(e) => setForm({ ...form, rider: e.target.value })}
          options={riderList}
        />
        <Input
          label="Amount (GH₵)"
          type="number"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="0.00"
        />
        <Select
          label="Payment Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={[
            { value: "salary", label: "Salary" },
            { value: "bonus", label: "Bonus" },
            { value: "advance", label: "Advance" },
            { value: "fuel", label: "Fuel" },
            { value: "other", label: "Other" },
          ]}
        />
        <Input
          label="Note (optional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Any additional notes"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Payment
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Remittance Tab — "Cash the rider brought back" ─── */
function RemittanceTab({
  remittances,
  editRemittance,
  settings,
}: {
  remittances: Record<string, Remittance>;
  editRemittance: (id: string, updates: Partial<Remittance>) => Promise<void>;
  settings: ReturnType<typeof useFirebaseStore.getState>["settings"];
}) {
  const sorted = Object.entries(remittances)
    .map(([id, r]) => ({ ...r, id }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const confirmed = sorted.filter((r) => r.status === "confirmed");
  const pending = sorted.filter((r) => r.status === "pending");

  const handleConfirm = async (id: string) => {
    try {
      await editRemittance(id, { status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: "management" });
      toast.success("Confirmed \u2714");
    } catch {
      toast.error("Failed to confirm");
    }
  };

  const handleDispute = async (id: string) => {
    try {
      await editRemittance(id, { status: "disputed" });
      toast.error("Disputed");
    } catch {
      toast.error("Failed");
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Explanation */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3">
        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          <strong>Remittance</strong> = the cash the rider hands to you at the end of the day.
          This is your actual money received. Sales minus what was spent on fuel/wages during the day.
        </p>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
          <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Confirmed</p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular mt-1">
            {c(confirmed.reduce((s, r) => s + r.amount, 0))}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{confirmed.length} remittance{confirmed.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
          <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">Pending</p>
          <p className="text-xl font-black text-amber-600 dark:text-amber-400 tabular mt-1">
            {c(pending.reduce((s, r) => s + r.amount, 0))}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{pending.length} waiting</p>
        </div>
      </div>

      {/* Pending first (needs action) */}
      {pending.length > 0 && (
        <>
          <SectionHeader title="Needs Your Action" />
          {pending.map((r) => (
            <Card key={r.id} padding="sm" className="border-l-4 border-l-amber-500">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {r.rider_name || r.rider_id}
                  </p>
                  <p className="text-[11px] text-gray-500">{dateLabel(r.remittance_date)} \u2022 {r.payment_method}</p>
                  <div className="mt-1 flex items-center gap-3 text-[11px]">
                    <span className="text-gray-400">
                      Says he made: <strong className="text-gray-600 dark:text-gray-300">{c(r.expected_amount || 0)}</strong>
                    </span>
                    <span className="text-gray-400">
                      Bringing: <strong className="text-emerald-600 dark:text-emerald-400">{c(r.amount)}</strong>
                    </span>
                  </div>
                  {r.expected_amount && r.amount < r.expected_amount && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      \u26A0 {c(r.expected_amount - r.amount)} difference (spent on fuel/expenses from sales)
                    </p>
                  )}
                </div>
                <p className="text-lg font-black text-gray-900 dark:text-white tabular">{c(r.amount)}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="bolt" size="sm" onClick={() => handleConfirm(r.id)}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                  Yes, Received
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDispute(r.id)}
                  icon={<XCircle className="h-3.5 w-3.5" />}>
                  Dispute
                </Button>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* Confirmed history */}
      {confirmed.length > 0 && (
        <>
          <SectionHeader title="Confirmed Cash Received" />
          {confirmed.map((r) => (
            <Card key={r.id} padding="sm" className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {r.rider_name?.split(" ")[0] || r.rider_id}
                  </p>
                  <p className="text-[11px] text-gray-500">{dateLabel(r.remittance_date)}</p>
                </div>
              </div>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular">{c(r.amount)}</p>
            </Card>
          ))}
        </>
      )}

      {sorted.length === 0 && (
        <EmptyState title="No remittances yet" message="When the rider submits daily cash, it will appear here" />
      )}
    </div>
  );
}
