"use client";

import React, { useMemo, useState } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DEFAULTS } from "@/lib/constants";
import {
  PiggyBank, TrendingUp, TrendingDown, Wallet, Receipt, Truck,
  Fuel, Wrench, ShoppingBag, DollarSign, ArrowUpRight, ArrowDownRight,
  CalendarDays, Banknote, AlertTriangle, CheckCircle2, Target,
  Activity, Percent, ChevronDown, ChevronUp, BarChart3, Scale,
  Clock, Package, CircleDollarSign, HandCoins, Landmark
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area
} from "recharts";

// ─── Helpers ───
function formatCompact(n: number): string {
  if (n >= 1000000) return `GH₵${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `GH₵${(n / 1000).toFixed(1)}K`;
  return `GH₵${Math.round(n)}`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}

// ─── Color palette for charts ───
const CHART_COLORS = [
  "#F5A623", "#34D399", "#3B82F6", "#8B5CF6", "#EF4444",
  "#EC4899", "#F97316", "#14B8A6", "#6366F1", "#84CC16",
];

// ─── MAIN PAGE ───
export default function AnalyticsPage() {
  const {
    dailyLogs, expenses, payments, settings,
    maintenance, fuelLogs, appTrips, appShifts, riders,
  } = useFirebaseStore(useShallow((s) => ({
    dailyLogs: s.dailyLogs,
    expenses: s.expenses,
    payments: s.payments,
    settings: s.settings,
    maintenance: s.maintenance,
    fuelLogs: s.fuelLogs,
    appTrips: s.appTrips,
    appShifts: s.appShifts,
    riders: s.riders,
  })));

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const toggleSection = (id: string) => setExpandedSection(expandedSection === id ? null : id);

  // ══════════════════════════════════════════════════════════
  // ██ SEED CAPITAL / INVESTMENT
  // ══════════════════════════════════════════════════════════
  const investmentBreakdown = useMemo(() => {
    if (!settings) return [];
    return [
      { name: "Tricycle (Pragya)", amount: settings.bike_cost || 0, icon: "🛺" },
      { name: "GPS Tracker", amount: settings.tracker || 0, icon: "📡" },
      { name: "DVLA Registration", amount: settings.dvla || 0, icon: "📋" },
      { name: "Transport", amount: settings.transport || 0, icon: "🚛" },
      { name: "Vehicle Registration", amount: settings.veh_reg || 0, icon: "📝" },
      { name: "Insurance Setup", amount: settings.ins_setup || 0, icon: "🛡️" },
      { name: "Permit Setup", amount: settings.permit_setup || 0, icon: "📄" },
      { name: "Miscellaneous Startup", amount: settings.misc_start || 0, icon: "📦" },
    ].filter(item => item.amount > 0);
  }, [settings]);

  const totalInvestment = useMemo(() =>
    investmentBreakdown.reduce((s, i) => s + i.amount, 0),
  [investmentBreakdown]);

  const totalPaid = settings?.total_paid || 0;

  // ══════════════════════════════════════════════════════════
  // ██ CAPITAL PAYMENTS
  // ══════════════════════════════════════════════════════════
  const capitalPayments = useMemo(() => {
    return Object.entries(payments)
      .map(([key, p]) => ({ key, ...p }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [payments]);

  const totalCapitalPayments = useMemo(() =>
    capitalPayments.reduce((s, p) => s + (p.amount || 0), 0),
  [capitalPayments]);

  // ══════════════════════════════════════════════════════════
  // ██ EXPENSES
  // ══════════════════════════════════════════════════════════
  const expenseList = useMemo(() =>
    Object.entries(expenses)
      .map(([key, e]) => ({ key, ...e }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  [expenses]);

  const totalExpenses = useMemo(() =>
    expenseList.reduce((s, e) => s + (e.amount || 0), 0),
  [expenseList]);

  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenseList.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenseList]);

  const expenseChartData = useMemo(() =>
    expensesByCategory.map((e, i) => ({
      ...e,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
  [expensesByCategory]);

  // ══════════════════════════════════════════════════════════
  // ██ FUEL & MAINTENANCE
  // ══════════════════════════════════════════════════════════
  const allFuel = useMemo(() =>
    Object.entries(fuelLogs).map(([k, f]) => ({ key: k, ...f })),
  [fuelLogs]);
  const totalFuelCost = useMemo(() =>
    allFuel.reduce((s, f) => s + (f.cost || 0), 0),
  [allFuel]);
  const totalLitres = useMemo(() =>
    allFuel.reduce((s, f) => s + (f.litres || 0), 0),
  [allFuel]);

  const allMaintenance = useMemo(() =>
    Object.entries(maintenance).map(([k, m]) => ({ key: k, ...m })),
  [maintenance]);
  const totalMaintenanceCost = useMemo(() =>
    allMaintenance.reduce((s, m) => s + (m.total_cost || 0), 0),
  [allMaintenance]);

  // ══════════════════════════════════════════════════════════
  // ██ REVENUE
  // ══════════════════════════════════════════════════════════
  const allLogs = useMemo(() => Object.values(dailyLogs), [dailyLogs]);
  const totalRevenue = useMemo(() =>
    allLogs.reduce((s, l) => s + (l.total_revenue || 0), 0),
  [allLogs]);
  const totalTrips = useMemo(() =>
    allLogs.reduce((s, l) => s + (l.trips || 0), 0),
  [allLogs]);
  const totalPassengers = useMemo(() =>
    allLogs.reduce((s, l) => s + (l.passengers || 0), 0),
  [allLogs]);

  const daysOfOperation = useMemo(() => {
    const dates = new Set(allLogs.map(l => l.date));
    return dates.size;
  }, [allLogs]);

  const avgDailyRevenue = daysOfOperation > 0 ? totalRevenue / daysOfOperation : 0;

  // Revenue by date for chart
  const revenueByDate = useMemo(() => {
    const map: Record<string, number> = {};
    allLogs.forEach(l => {
      map[l.date] = (map[l.date] || 0) + l.total_revenue;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        revenue,
      }));
  }, [allLogs]);

  // ══════════════════════════════════════════════════════════
  // ██ TOTAL MONEY OUT / REMAINING CAPITAL
  // ══════════════════════════════════════════════════════════
  // Seed capital was used to buy assets (bike, tracker, DVLA, etc.) AND pay for operational expenses.
  // Maintenance records track the SAME work already recorded in expenses (e.g. tyres + vulcanizer),
  // so we do NOT add maintenance on top — that would be double-counting.
  const totalMoneyOut = totalInvestment + totalExpenses; // assets + ops
  const capitalRemaining = totalPaid - totalMoneyOut;
  // Burn rate only on operational expenses (not the one-time asset purchases)
  const opsBurnRate = daysOfOperation > 0 ? totalExpenses / daysOfOperation : 0;
  const capitalRunwayDays = opsBurnRate > 0 ? Math.floor(capitalRemaining / opsBurnRate) : Infinity;

  // ══════════════════════════════════════════════════════════ 
  // ██ NET POSITION
  // ══════════════════════════════════════════════════════════
  const netProfit = totalRevenue - totalExpenses;
  const roi = totalInvestment > 0 ? ((netProfit / totalInvestment) * 100) : 0;

  // ── Business age ──
  const earliestDate = useMemo(() => {
    const dates = [
      ...expenseList.map(e => e.date),
      ...capitalPayments.map(p => p.date),
      ...allLogs.map(l => l.date),
    ].filter(Boolean).sort();
    return dates[0] || new Date().toISOString().slice(0, 10);
  }, [expenseList, capitalPayments, allLogs]);

  const businessAgeDays = daysSince(earliestDate);

  // ══════════════════════════════════════════════════════════
  // ██ DAILY TARGET & BREAK-EVEN
  // ══════════════════════════════════════════════════════════
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const workDays = settings?.wdays || 26;
  const dailyProfit = avgDailyRevenue > 0 ? avgDailyRevenue - riderDailyPay : 0;
  const breakEvenDays = dailyProfit > 0 ? Math.ceil(totalInvestment / dailyProfit) : Infinity;
  const breakEvenProgress = totalInvestment > 0 ? Math.min(((totalRevenue - totalExpenses) / totalInvestment) * 100, 100) : 0;


  // ═══════════════════════════════════════════════════════════
  //                        RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 pb-28">
      {/* ── Hero: Financial Snapshot ── */}
      <div className="bg-linear-to-br from-bolt/10 via-gold/5 to-transparent rounded-2xl p-5 border border-bolt/20">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-bolt/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-bolt" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Complete financial overview &bull; Business age: {businessAgeDays} day{businessAgeDays !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/60 dark:bg-surface-700/60 rounded-xl p-3 border border-gray-100/60 dark:border-surface-600/40">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank className="w-3.5 h-3.5 text-bolt" />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Seed Capital</span>
            </div>
            <p className="text-xl font-black text-bolt tabular">{formatCurrency(totalPaid)}</p>
            <p className="text-[10px] text-gray-400">{capitalPayments.length} payment{capitalPayments.length !== 1 ? "s" : ""}</p>
          </div>

          <div className="bg-white/60 dark:bg-surface-700/60 rounded-xl p-3 border border-gray-100/60 dark:border-surface-600/40">
            <div className="flex items-center gap-1.5 mb-1">
              <Scale className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Capital Left</span>
            </div>
            <p className={`text-xl font-black tabular ${capitalRemaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
              {formatCurrency(capitalRemaining)}
            </p>
            <p className="text-[10px] text-gray-400">{pct(capitalRemaining, totalPaid)} remaining</p>
          </div>

          <div className="bg-white/60 dark:bg-surface-700/60 rounded-xl p-3 border border-gray-100/60 dark:border-surface-600/40">
            <div className="flex items-center gap-1.5 mb-1">
              <Receipt className="w-3.5 h-3.5 text-danger" />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Total Spent</span>
            </div>
            <p className="text-xl font-black text-danger tabular">{formatCurrency(totalMoneyOut)}</p>
            <p className="text-[10px] text-gray-400">{pct(totalMoneyOut, totalPaid)} of capital</p>
          </div>

          <div className="bg-white/60 dark:bg-surface-700/60 rounded-xl p-3 border border-gray-100/60 dark:border-surface-600/40">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-forest" />
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Revenue</span>
            </div>
            <p className="text-xl font-black text-forest-dark dark:text-forest tabular">{formatCurrency(totalRevenue)}</p>
            <p className="text-[10px] text-gray-400">{daysOfOperation} operating day{daysOfOperation !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  1. SEED CAPITAL BREAKDOWN                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Seed Capital Investment" />
        <Card>
          <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>What is this?</strong> This is the total money invested to start and set up Montbile Auto Services — 
              every cedi that was put in before operations began.
            </p>
          </div>

          {/* Investment items */}
          <div className="space-y-2.5">
            {investmentBreakdown.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-[10px] text-gray-400">{pct(item.amount, totalInvestment)} of total</p>
                  </div>
                </div>
                <p className="text-sm font-black text-gray-900 dark:text-white tabular">{formatCurrency(item.amount)}</p>
              </div>
            ))}
          </div>

          {/* Total bar */}
          <div className="mt-4 pt-3 border-t-2 border-bolt/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Total Asset Value</span>
              <span className="text-lg font-black text-bolt tabular">{formatCurrency(totalInvestment)}</span>
            </div>
          </div>

          {/* Pie chart */}
          {investmentBreakdown.length > 1 && (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={investmentBreakdown.map((item, i) => ({ ...item, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {investmentBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatCurrency(Number(v)), ""]}
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  2. CAPITAL PAYMENTS TIMELINE                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Capital Payments" />
        <Card>
          <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>What is this?</strong> These are the cash payments made to fund the business — 
              the actual money that was handed over to acquire the tricycle, pay for registration, and cover other startup costs.
            </p>
          </div>

          {/* Timeline */}
          <div className="relative pl-6">
            <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-bolt/20 dark:bg-bolt/30 rounded-full" />
            {capitalPayments.map((p, i) => (
              <div key={p.key} className="relative pb-4 last:pb-0">
                <div className="absolute left-[-17px] top-1 w-4 h-4 rounded-full bg-bolt border-2 border-white dark:border-surface-800 shadow-sm" />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white">{formatCurrency(p.amount)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{p.notes || p.reference}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(p.date)} &bull; {p.method}</p>
                  </div>
                  <Badge variant="gold">#{i + 1}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-4 pt-3 border-t-2 border-bolt/30 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Paid In</p>
              <p className="text-lg font-black text-bolt tabular">{formatCurrency(totalCapitalPayments)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Average Payment</p>
              <p className="text-lg font-black text-gray-800 dark:text-white tabular">
                {capitalPayments.length > 0 ? formatCurrency(totalCapitalPayments / capitalPayments.length) : "—"}
              </p>
            </div>
          </div>

          {totalCapitalPayments !== totalPaid && (
            <div className="mt-3 bg-amber-50/80 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Payment records ({formatCurrency(totalCapitalPayments)}) differ from settings total_paid ({formatCurrency(totalPaid)}).
                  Update settings to match if needed.
                </p>
              </div>
            </div>
          )}
        </Card>
      </section>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  3. EXPENSES BREAKDOWN                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="All Expenses" />
        <Card>
          <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>What is this?</strong> Every expense recorded in the business — repairs, fuel, rider gear, 
              and all other operational costs. This is what eats into your capital.
            </p>
          </div>

          {/* Category breakdown */}
          {expensesByCategory.length > 0 && (
            <>
              <div className="space-y-2.5 mb-4">
                {expensesByCategory.map((cat, i) => {
                  const barPct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{cat.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{pct(cat.amount, totalExpenses)}</span>
                          <span className="text-xs font-black text-gray-900 dark:text-white tabular">{formatCurrency(cat.amount)}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${barPct}%`,
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pie chart */}
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={expenseChartData}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {expenseChartData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatCurrency(Number(v)), ""]}
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}

          {/* Expense line items */}
          <button
            onClick={() => toggleSection("expenses")}
            className="flex items-center justify-between w-full mt-3 pt-3 border-t border-gray-100 dark:border-surface-600"
          >
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              All {expenseList.length} Expense{expenseList.length !== 1 ? "s" : ""}
            </span>
            {expandedSection === "expenses"
              ? <ChevronUp className="w-4 h-4 text-gray-400" />
              : <ChevronDown className="w-4 h-4 text-gray-400" />
            }
          </button>
          {expandedSection === "expenses" && (
            <div className="mt-2 space-y-2">
              {expenseList.map((e) => (
                <div key={e.key} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-surface-600/50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{e.description}</p>
                    <p className="text-[10px] text-gray-400">
                      {formatDate(e.date)} &bull; {e.category} &bull; {e.payment_method}
                    </p>
                  </div>
                  <p className="text-sm font-black text-danger tabular">{formatCurrency(e.amount)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="mt-3 pt-3 border-t-2 border-danger/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Total Expenses</span>
              <span className="text-lg font-black text-danger tabular">{formatCurrency(totalExpenses)}</span>
            </div>
          </div>
        </Card>
      </section>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  4. MAINTENANCE LOG                                     */}
      {/* ═══════════════════════════════════════════════════════ */}
      {allMaintenance.length > 0 && (
        <section>
          <SectionHeader title="Maintenance Records" />
          <Card>
            <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>What is this?</strong> Detailed maintenance and repair records for the tricycle.
                These track parts costs, labour, and type of service performed.
              </p>
            </div>

            {allMaintenance.map((m) => (
              <div key={m.key} className="py-3 border-b border-gray-100 dark:border-surface-600 last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-bolt" />
                    <p className="text-sm font-bold text-gray-800 dark:text-white">{m.service_type}</p>
                  </div>
                  <p className="text-sm font-black text-danger tabular">{formatCurrency(m.total_cost)}</p>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-300 ml-6">{m.description}</p>
                <div className="flex items-center gap-4 ml-6 mt-1">
                  <span className="text-[10px] text-gray-400">{formatDate(m.date)}</span>
                  <span className="text-[10px] text-gray-400">Parts: {formatCurrency(m.parts_cost)}</span>
                  <span className="text-[10px] text-gray-400">Labour: {formatCurrency(m.labour_cost)}</span>
                </div>
              </div>
            ))}

            <div className="mt-3 pt-3 border-t-2 border-orange-300/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300">Total Maintenance</span>
                <span className="text-lg font-black text-orange-500 tabular">{formatCurrency(totalMaintenanceCost)}</span>
              </div>
            </div>
          </Card>
        </section>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  5. FUEL LOG                                            */}
      {/* ═══════════════════════════════════════════════════════ */}
      {allFuel.length > 0 && (
        <section>
          <SectionHeader title="Fuel Log" />
          <Card>
            <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>What is this?</strong> A record of every fuel purchase — litres filled, cost, and odometer reading.
              </p>
            </div>

            {allFuel.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-surface-600 last:border-0">
                <div className="flex items-center gap-3">
                  <Fuel className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{f.litres}L &bull; {formatCurrency(f.cost)}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(f.date)} &bull; {f.notes || "—"}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Odo: {f.odometer.toLocaleString()}</p>
              </div>
            ))}

            <div className="mt-3 pt-3 border-t-2 border-amber-300/30 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Fuel Cost</p>
                <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular">{formatCurrency(totalFuelCost)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Litres</p>
                <p className="text-lg font-black text-gray-800 dark:text-white tabular">{totalLitres}L</p>
              </div>
            </div>
          </Card>
        </section>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  6. REVENUE (if any daily logs exist)                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {allLogs.length > 0 && (
        <section>
          <SectionHeader title="Revenue Overview" />
          <Card>
            <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                <strong>What is this?</strong> All ride revenue collected from daily operations — fares, extra income, 
                and the total earned from passengers.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Total</p>
                <p className="text-lg font-black text-forest-dark dark:text-forest tabular">{formatCurrency(totalRevenue)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Avg/Day</p>
                <p className="text-lg font-black text-gray-800 dark:text-white tabular">{formatCurrency(avgDailyRevenue)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Days Active</p>
                <p className="text-lg font-black text-bold tabular">{daysOfOperation}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3 text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Total Trips</p>
                <p className="text-xl font-black text-bolt tabular">{totalTrips.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3 text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Passengers</p>
                <p className="text-xl font-black text-bolt tabular">{totalPassengers.toLocaleString()}</p>
              </div>
            </div>

            {revenueByDate.length > 1 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={revenueByDate}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₵${v}`} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), ""]} contentStyle={{ borderRadius: 12, fontSize: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                  <Area type="monotone" dataKey="revenue" stroke="#34D399" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </section>
      )}


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  7. CAPITAL POSITION / MONEY FLOW                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Capital Position" />
        <Card>
          <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>What is this?</strong> A clear picture of where the money currently stands — 
              how much came in, how much was spent, and how much capital is left. 
              The &ldquo;runway&rdquo; tells you how many more days you can operate before the remaining capital runs out 
              (assuming the same spending rate).
            </p>
          </div>

          {/* Money flow cards */}
          <div className="space-y-3">
            {/* Money In */}
            <div className="bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-200/40 dark:border-emerald-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownRight className="w-5 h-5 text-emerald-500" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Money In</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-300">Capital Invested</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(totalPaid)}</span>
                </div>
                {totalRevenue > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Revenue Earned</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(totalRevenue)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-700/30 flex justify-between items-center">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Total Money In</span>
                  <span className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular">{formatCurrency(totalPaid + totalRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Money Out */}
            <div className="bg-red-50/60 dark:bg-red-900/10 border border-red-200/40 dark:border-red-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpRight className="w-5 h-5 text-danger" />
                <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">Money Out</span>
              </div>
              <div className="space-y-2">
                {/* Asset purchases (from seed capital) */}
                {investmentBreakdown.map((item) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{item.icon} {item.name}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                {investmentBreakdown.length > 0 && expensesByCategory.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-red-100/50 dark:border-red-900/20">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Operational Expenses</p>
                  </div>
                )}
                {expensesByCategory.map((cat) => (
                  <div key={cat.category} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{cat.category}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-red-200/50 dark:border-red-700/30 flex justify-between items-center">
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">Total Money Out</span>
                  <span className="text-lg font-black text-red-700 dark:text-red-400 tabular">{formatCurrency(totalMoneyOut)}</span>
                </div>
              </div>
            </div>

            {/* Net Position */}
            <div className={`rounded-xl p-4 border ${capitalRemaining >= 0 ? "bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/40 dark:border-emerald-800/30" : "bg-red-50/60 dark:bg-red-900/10 border-red-200/40 dark:border-red-800/30"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {capitalRemaining >= 0 
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <AlertTriangle className="w-5 h-5 text-danger" />
                  }
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Capital Remaining</span>
                </div>
                <span className={`text-xl font-black tabular ${capitalRemaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                  {formatCurrency(capitalRemaining)}
                </span>
              </div>
            </div>
          </div>

          {/* Capital usage progress bar */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Capital Usage</span>
              <span className="text-[11px] font-black text-gray-700 dark:text-gray-200 tabular">
                {pct(totalMoneyOut, totalPaid)} used
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-400 to-danger transition-all duration-700"
                style={{ width: `${Math.min((totalMoneyOut / Math.max(totalPaid, 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-gray-400">₵0</span>
              <span className="text-[9px] text-gray-400">{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          {/* Runway */}
          {opsBurnRate > 0 && (
            <div className="mt-4 bg-gray-50 dark:bg-surface-700 rounded-xl p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Burn Rate</p>
                  <p className="text-lg font-black text-gray-800 dark:text-white tabular">{formatCurrency(opsBurnRate)}</p>
                  <p className="text-[9px] text-gray-400">per day (ops)</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Runway</p>
                  <p className="text-lg font-black text-bolt tabular">
                    {capitalRunwayDays === Infinity ? "∞" : `${capitalRunwayDays}d`}
                  </p>
                  <p className="text-[9px] text-gray-400">at current spend</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Monthly Burn</p>
                  <p className="text-lg font-black text-gray-800 dark:text-white tabular">{formatCurrency(opsBurnRate * 30)}</p>
                  <p className="text-[9px] text-gray-400">projected</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  8. BREAK-EVEN & ROI                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Break-Even & ROI" />
        <Card>
          <div className="bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 rounded-xl p-3 mb-4">
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              <strong>What is this?</strong> Break-even is when the total profit earned from operations 
              equals the amount invested to start the business — meaning you&apos;ve recovered your entire investment. 
              ROI (Return on Investment) shows what percentage of your investment you&apos;ve earned back so far.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Investment</p>
              <p className="text-lg font-black text-bolt tabular">{formatCurrency(totalInvestment)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Net Profit</p>
              <p className={`text-lg font-black tabular ${netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                {formatCurrency(netProfit)}
              </p>
            </div>
          </div>

          {/* Progress to break-even */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-bolt" />
                Progress to Break-Even
              </span>
              <span className="text-xs font-black text-bolt tabular">{breakEvenProgress.toFixed(1)}%</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-bolt to-emerald-400 transition-all duration-700"
                style={{ width: `${breakEvenProgress}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-gray-400">₵0</span>
              <span className="text-[9px] text-gray-400">{formatCurrency(totalInvestment)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">ROI</p>
              <p className={`text-lg font-black tabular ${roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                {roi.toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-surface-700 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Est. Break-Even</p>
              <p className="text-lg font-black text-bolt tabular">
                {breakEvenDays === Infinity ? "N/A" : `${breakEvenDays}d`}
              </p>
              <p className="text-[9px] text-gray-400">
                {breakEvenDays !== Infinity ? `≈ ${Math.ceil(breakEvenDays / 30)} months` : "Need revenue data"}
              </p>
            </div>
          </div>

          {avgDailyRevenue > 0 && (
            <div className="mt-3 bg-gray-50 dark:bg-surface-700 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Daily Profitability</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-gray-400">Avg Revenue</p>
                  <p className="text-sm font-black text-forest-dark dark:text-forest tabular">{formatCurrency(avgDailyRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Rider Pay</p>
                  <p className="text-sm font-black text-danger tabular">{formatCurrency(riderDailyPay)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Daily Profit</p>
                  <p className={`text-sm font-black tabular ${dailyProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                    {formatCurrency(dailyProfit)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>


      {/* ═══════════════════════════════════════════════════════ */}
      {/*  9. QUICK STATS SUMMARY                                 */}
      {/* ═══════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader title="Quick Stats" />
        <Card>
          <div className="space-y-3">
            {[
              { label: "Total Capital Invested", value: formatCurrency(totalPaid), icon: <Landmark className="w-4 h-4 text-bolt" /> },
              { label: "Total Asset Value (at cost)", value: formatCurrency(totalInvestment), icon: <Package className="w-4 h-4 text-bolt" /> },
              { label: "Total Expenses", value: formatCurrency(totalExpenses), icon: <Receipt className="w-4 h-4 text-danger" /> },
              { label: "Total Maintenance Cost", value: formatCurrency(totalMaintenanceCost), icon: <Wrench className="w-4 h-4 text-orange-500" /> },
              { label: "Total Fuel Cost", value: formatCurrency(totalFuelCost), icon: <Fuel className="w-4 h-4 text-amber-500" /> },
              { label: "Total Revenue Earned", value: formatCurrency(totalRevenue), icon: <TrendingUp className="w-4 h-4 text-forest" /> },
              { label: "Net Profit / (Loss)", value: formatCurrency(netProfit), icon: <Activity className="w-4 h-4 text-emerald-500" />, highlight: netProfit >= 0 },
              { label: "Capital Remaining", value: formatCurrency(capitalRemaining), icon: <Scale className="w-4 h-4 text-emerald-500" />, highlight: capitalRemaining >= 0 },
              { label: "Business Age", value: `${businessAgeDays} day${businessAgeDays !== 1 ? "s" : ""}`, icon: <CalendarDays className="w-4 h-4 text-gray-400" /> },
              { label: "Capital Payments Made", value: `${capitalPayments.length}`, icon: <HandCoins className="w-4 h-4 text-gold" /> },
              { label: "Expense Entries", value: `${expenseList.length}`, icon: <ShoppingBag className="w-4 h-4 text-purple-500" /> },
              { label: "Maintenance Records", value: `${allMaintenance.length}`, icon: <Wrench className="w-4 h-4 text-orange-500" /> },
            ].map((stat, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600 last:border-0">
                <div className="flex items-center gap-2.5">
                  {stat.icon}
                  <span className="text-sm text-gray-600 dark:text-gray-300">{stat.label}</span>
                </div>
                <span className={`text-sm font-black tabular ${
                  stat.highlight === true ? "text-emerald-600 dark:text-emerald-400" :
                  stat.highlight === false ? "text-danger" :
                  "text-gray-900 dark:text-white"
                }`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>

    </div>
  );
}
