"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { DEFAULTS } from "@/lib/constants";
import {
  Sparkles, TrendingUp, TrendingDown, Target, Users, Truck,
  DollarSign, AlertTriangle, ArrowUpRight, ArrowDownRight,
  ChevronRight, Zap, ShieldCheck, ShieldAlert, ShieldX,
  Gauge, PiggyBank, CalendarCheck, Flame, Star, Activity,
  Percent, BadgeDollarSign, Scale, Timer, BrainCircuit,
  ChevronDown, ChevronUp, Minus
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
  AreaChart, Area, CartesianGrid, RadialBarChart, RadialBar,
  PieChart, Pie, LineChart, Line
} from "recharts";


// ─── Helpers ───
function avg(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function stdDev(arr: number[]) {
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(arr.length, 1));
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function grade(pct: number): { letter: string; color: string; bg: string } {
  if (pct >= 90) return { letter: "A+", color: "text-emerald-600", bg: "bg-emerald-500" };
  if (pct >= 80) return { letter: "A", color: "text-emerald-500", bg: "bg-emerald-400" };
  if (pct >= 70) return { letter: "B", color: "text-bolt", bg: "bg-bolt" };
  if (pct >= 60) return { letter: "C", color: "text-gold", bg: "bg-gold" };
  if (pct >= 50) return { letter: "D", color: "text-orange-500", bg: "bg-orange-400" };
  return { letter: "F", color: "text-danger", bg: "bg-danger" };
}

function formatCompact(n: number): string {
  if (n >= 1000000) return `₵${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₵${(n / 1000).toFixed(1)}K`;
  return `₵${Math.round(n)}`;
}

// ─── Health Score Gauge ───
function HealthGauge({ score, label }: { score: number; label: string }) {
  const clamped = clamp(score, 0, 100);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (clamped / 100) * circumference * 0.75; // 270° arc
  const color = clamped >= 75 ? "#34D399" : clamped >= 50 ? "#F5A623" : clamped >= 30 ? "#F97316" : "#EF4444";
  const bgColor = clamped >= 75 ? "text-emerald-500" : clamped >= 50 ? "text-gold" : clamped >= 30 ? "text-orange-500" : "text-danger";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-135">
          <circle cx="60" cy="60" r="54" stroke="#E5E7EB" strokeWidth="10" fill="none"
                  strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                  strokeLinecap="round" className="dark:stroke-surface-700" />
          <circle cx="60" cy="60" r="54" stroke={color} strokeWidth="10" fill="none"
                  strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${bgColor}`}>{Math.round(clamped)}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mini Score Bar ───
function ScoreBar({ label, score, max = 100, icon }: { label: string; score: number; max?: number; icon?: string }) {
  const pct = clamp((score / max) * 100, 0, 100);
  const color = pct >= 75 ? "from-emerald-400 to-emerald-500" : pct >= 50 ? "from-gold to-gold-dark" : pct >= 30 ? "from-orange-400 to-orange-500" : "from-danger to-red-600";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
          {icon && <span className="text-sm">{icon}</span>}
          {label}
        </span>
        <span className="text-[11px] font-black text-gray-800 dark:text-white tabular">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
        <div className={`h-full rounded-full bg-linear-to-r ${color} transition-all duration-700 ease-out`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Slider Component ───
function Slider({ label, value, onChange, min, max, step = 1, unit = "", prefix = "" }:
  { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; prefix?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <span className="text-xs font-black text-bolt tabular">{prefix}{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-surface-700 accent-bolt
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bolt [&::-webkit-slider-thumb]:shadow-md
                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white"
      />
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>{prefix}{min}{unit}</span>
        <span>{prefix}{max}{unit}</span>
      </div>
    </div>
  );
}


// ─── MAIN PAGE ───
export default function SimulationsPage() {
  const {
    dailyLogs, expenses, payments, riders, settings,
    appShifts, appTrips, appRemittances, maintenance,
    fuelLogs,
  } = useFirebaseStore(useShallow((s) => ({
    dailyLogs: s.dailyLogs,
    expenses: s.expenses,
    payments: s.payments,
    riders: s.riders,
    settings: s.settings,
    appShifts: s.appShifts,
    appTrips: s.appTrips,
    appRemittances: s.appRemittances,
    maintenance: s.maintenance,
    fuelLogs: s.fuelLogs,
  })));

  // Constants from settings
  const fleet = settings?.fleet || DEFAULTS.fleet;
  const fare = settings?.fare || DEFAULTS.fare;
  const pax = settings?.pax || DEFAULTS.pax;
  const tripsPerDay = settings?.trips || DEFAULTS.trips;
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const riderSalary = settings?.rider_monthly_salary || DEFAULTS.riderMonthlySalary;
  const workDays = settings?.wdays || 26;

  // Monthly operating costs from settings
  const monthlyOpCosts = useMemo(() => {
    if (!settings) return 0;
    return (settings.maint_m || 0) + (settings.ins_m || 0) + (settings.permit_m || 0) +
      (settings.tracker_m || 0) + (settings.phone_m || 0) + (settings.union_m || 0) + (settings.misc_m || 0);
  }, [settings]);

  // Total investment
  const totalInvestment = useMemo(() => {
    if (!settings) return 0;
    return (settings.bike_cost || 0) + (settings.transport || 0) + (settings.dvla || 0) +
      (settings.veh_reg || 0) + (settings.tracker || 0) + (settings.ins_setup || 0) +
      (settings.permit_setup || 0) + (settings.misc_start || 0);
  }, [settings]);

  // ── All daily revenues ──
  const allLogs = useMemo(() => Object.values(dailyLogs), [dailyLogs]);
  const allTrips = useMemo(() => Object.values(appTrips), [appTrips]);
  const allShifts = useMemo(() => Object.values(appShifts), [appShifts]);
  const allRemittances = useMemo(() => Object.values(appRemittances), [appRemittances]);
  const allExpenses = useMemo(() => Object.values(expenses), [expenses]);
  const allMaintenance = useMemo(() => Object.values(maintenance), [maintenance]);
  const allFuel = useMemo(() => Object.values(fuelLogs), [fuelLogs]);
  const riderList = useMemo(() => Object.entries(riders).map(([id, r]) => ({ ...r, id })), [riders]);

  // ── Revenue by date ──
  const revenueByDate = useMemo(() => {
    const map: Record<string, number> = {};
    // From daily logs
    allLogs.forEach(l => { map[l.date] = (map[l.date] || 0) + (l.total_revenue || 0); });
    // Also from live trips
    allTrips.forEach(t => {
      const d = t.created_at?.slice(0, 10);
      if (d && !map[d]) map[d] = 0;
      // Only add trip amounts for dates not covered by logs
    });
    return map;
  }, [allLogs, allTrips]);

  const revenueValues = useMemo(() => Object.values(revenueByDate).filter(v => v > 0), [revenueByDate]);
  const totalRevenue = revenueValues.reduce((a, b) => a + b, 0);
  const totalExpenseAmount = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const daysWithData = revenueValues.length || 1;

  // ── Core Metrics ──
  const avgDailyRevenue = totalRevenue / daysWithData;
  const bestDayRevenue = revenueValues.length > 0 ? Math.max(...revenueValues) : 0;
  const worstDayRevenue = revenueValues.length > 0 ? Math.min(...revenueValues) : 0;
  const revenueStdDev = stdDev(revenueValues);
  const revenueConsistency = avgDailyRevenue > 0 ? clamp(100 - (revenueStdDev / avgDailyRevenue) * 100, 0, 100) : 0;

  // Revenue per tricycle
  const revenuePerTricycle = avgDailyRevenue / fleet;
  const tripsPerTricyclePerDay = allLogs.length > 0
    ? allLogs.reduce((s, l) => s + (l.trips || 0), 0) / daysWithData / fleet
    : tripsPerDay;

  // ── Rider Performance Data ──
  const riderPerformance = useMemo(() => {
    return riderList.map(rider => {
      const riderLogs = allLogs.filter(l => l.rider === rider.name);
      const riderTrips = allTrips.filter(t => t.rider_id === rider.id);
      const riderShifts = allShifts.filter(s => s.rider_id === rider.id);
      const riderRemits = allRemittances.filter(r => r.rider_id === rider.id);

      const totalRev = riderLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
      const totalTrips = riderLogs.reduce((s, l) => s + (l.trips || 0), 0);
      const daysWorked = riderLogs.length || 1;
      const avgRevPerDay = totalRev / daysWorked;
      const dailyRevenues = riderLogs.map(l => l.total_revenue || 0);
      const targetHitDays = dailyRevenues.filter(r => r >= dailyTarget).length;
      const targetHitRate = daysWorked > 0 ? (targetHitDays / daysWorked) * 100 : 0;
      const consistency = avgRevPerDay > 0 ? clamp(100 - (stdDev(dailyRevenues) / avgRevPerDay) * 100, 0, 100) : 0;
      const avgTripsPerDay = totalTrips / daysWorked;

      // Trips from app (live trips)
      const liveTripsCount = riderTrips.length;
      const liveEarnings = riderTrips.reduce((s, t) => s + (t.fare_amount || 0), 0);

      // Remittance compliance
      const confirmedRemits = riderRemits.filter(r => r.status === "confirmed").length;
      const totalRemits = riderRemits.length || 1;
      const remitCompliance = (confirmedRemits / totalRemits) * 100;

      // Overall score
      const overallScore = (
        (targetHitRate * 0.3) +
        (consistency * 0.25) +
        (Math.min(avgTripsPerDay / tripsPerDay, 1) * 100 * 0.2) +
        (remitCompliance * 0.15) +
        (Math.min(daysWorked / 7, 1) * 100 * 0.1)
      );

      return {
        ...rider,
        totalRev, totalTrips, daysWorked, avgRevPerDay, targetHitRate,
        consistency, avgTripsPerDay, liveTripsCount, liveEarnings,
        remitCompliance, overallScore, dailyRevenues, confirmedRemits,
        totalRemits: riderRemits.length,
        completedShifts: riderShifts.filter(s => s.status === "completed").length,
      };
    }).sort((a, b) => b.overallScore - a.overallScore);
  }, [riderList, allLogs, allTrips, allShifts, allRemittances, tripsPerDay, dailyTarget]);


  // ══════════════════════════════════════════════════════════
  // ██ BUSINESS HEALTH SCORE
  // ══════════════════════════════════════════════════════════
  const healthScore = useMemo(() => {
    const scores: { label: string; score: number; weight: number; icon: string }[] = [];

    // 1. Revenue vs Target (are we hitting daily targets?)
    const revVsTarget = avgDailyRevenue > 0 ? clamp((avgDailyRevenue / dailyTarget) * 100, 0, 100) : 0;
    scores.push({ label: "Revenue vs Target", score: revVsTarget, weight: 25, icon: "🎯" });

    // 2. Revenue Consistency (low variance = predictable)
    scores.push({ label: "Revenue Consistency", score: revenueConsistency, weight: 20, icon: "📊" });

    // 3. Fleet Utilization (riders / tricycles)
    const activeRiders = riderList.filter(r => r.status === "active").length;
    const utilization = fleet > 0 ? clamp((activeRiders / fleet) * 100, 0, 100) : 0;
    scores.push({ label: "Fleet Utilization", score: utilization, weight: 15, icon: "🛺" });

    // 4. Rider Performance (avg rider score)
    const avgRiderScore = riderPerformance.length > 0
      ? avg(riderPerformance.map(r => r.overallScore))
      : 0;
    scores.push({ label: "Rider Performance", score: clamp(avgRiderScore, 0, 100), weight: 15, icon: "👤" });

    // 5. Profitability (profit margin)
    const profitMargin = totalRevenue > 0 ? clamp(((totalRevenue - totalExpenseAmount) / totalRevenue) * 100, 0, 100) : 0;
    scores.push({ label: "Profitability", score: profitMargin, weight: 15, icon: "💰" });

    // 6. Growth Trajectory (is revenue trending up?)
    const sortedDates = Object.keys(revenueByDate).sort();
    let growthScore = 50; // neutral
    if (sortedDates.length >= 4) {
      const half = Math.floor(sortedDates.length / 2);
      const firstHalf = sortedDates.slice(0, half).map(d => revenueByDate[d]).filter(v => v > 0);
      const secondHalf = sortedDates.slice(half).map(d => revenueByDate[d]).filter(v => v > 0);
      const avgFirst = avg(firstHalf);
      const avgSecond = avg(secondHalf);
      if (avgFirst > 0) {
        const growth = ((avgSecond - avgFirst) / avgFirst) * 100;
        growthScore = clamp(50 + growth, 0, 100);
      }
    }
    scores.push({ label: "Growth Trend", score: growthScore, weight: 10, icon: "📈" });

    const weighted = scores.reduce((s, item) => s + (item.score * item.weight), 0) / 100;
    return { overall: clamp(weighted, 0, 100), breakdown: scores };
  }, [avgDailyRevenue, dailyTarget, revenueConsistency, riderList, fleet, riderPerformance, totalRevenue, totalExpenseAmount, revenueByDate]);


  // ══════════════════════════════════════════════════════════
  // ██ REVENUE PROJECTIONS
  // ══════════════════════════════════════════════════════════
  const projections = useMemo(() => {
    const avgDaily = avgDailyRevenue;
    const bestDaily = bestDayRevenue;
    const worstDaily = worstDayRevenue;

    // Daily costs (rider pay only, since remittance flow = rider submits all, gets paid back)
    const dailyRiderCost = riderDailyPay * Math.max(riderList.filter(r => r.status === "active").length, 1);
    const dailyOpCost = monthlyOpCosts / workDays;
    const dailyCost = dailyRiderCost + dailyOpCost;

    return {
      daily: { best: bestDaily, avg: avgDaily, worst: worstDaily, cost: dailyCost },
      weekly: { best: bestDaily * 7, avg: avgDaily * 7, worst: worstDaily * 7, cost: dailyCost * 7 },
      monthly: { best: bestDaily * workDays, avg: avgDaily * workDays, worst: worstDaily * workDays, cost: dailyCost * workDays },
      yearly: { best: bestDaily * workDays * 12, avg: avgDaily * workDays * 12, worst: worstDaily * workDays * 12, cost: dailyCost * workDays * 12 },
    };
  }, [avgDailyRevenue, bestDayRevenue, worstDayRevenue, riderDailyPay, riderList, monthlyOpCosts, workDays]);

  const projectionChartData = useMemo(() => [
    { period: "Day", best: projections.daily.best, avg: projections.daily.avg, worst: projections.daily.worst },
    { period: "Week", best: projections.weekly.best, avg: projections.weekly.avg, worst: projections.weekly.worst },
    { period: "Month", best: projections.monthly.best, avg: projections.monthly.avg, worst: projections.monthly.worst },
  ], [projections]);


  // ══════════════════════════════════════════════════════════
  // ██ FLEET SCALING SIMULATOR (What-If)
  // ══════════════════════════════════════════════════════════
  const [simFleet, setSimFleet] = useState(fleet);
  const [simFare, setSimFare] = useState(fare);
  const [simTrips, setSimTrips] = useState(tripsPerDay);
  const [simPax, setSimPax] = useState(pax);
  const [simWorkDays, setSimWorkDays] = useState(workDays);

  const whatIfResults = useMemo(() => {
    const dailyRevPerUnit = simFare * simPax * simTrips;
    const dailyRevTotal = dailyRevPerUnit * simFleet;
    const dailyRiderCost = riderDailyPay * simFleet;
    const dailyBonusPerRider = Math.max(0, dailyRevPerUnit - dailyTarget);
    const dailyBonusTotal = dailyBonusPerRider * simFleet;
    const monthlyRev = dailyRevTotal * simWorkDays;
    const monthlyRiderCost = (dailyRiderCost + dailyBonusTotal) * simWorkDays;
    const monthlyOps = monthlyOpCosts * simFleet; // scale ops with fleet
    const monthlyCost = monthlyRiderCost + monthlyOps;
    const monthlyProfit = monthlyRev - monthlyCost;
    const yearlyProfit = monthlyProfit * 12;
    const investmentPerUnit = totalInvestment / Math.max(fleet, 1);
    const totalNewInvestment = investmentPerUnit * simFleet;
    const monthsToBreakEven = monthlyProfit > 0 ? Math.ceil(totalNewInvestment / monthlyProfit) : Infinity;
    const roi = totalNewInvestment > 0 ? ((yearlyProfit / totalNewInvestment) * 100) : 0;

    return {
      dailyRevPerUnit, dailyRevTotal, dailyRiderCost, dailyBonusTotal,
      monthlyRev, monthlyRiderCost, monthlyOps, monthlyCost, monthlyProfit,
      yearlyProfit, totalNewInvestment, monthsToBreakEven, roi,
    };
  }, [simFleet, simFare, simTrips, simPax, simWorkDays, riderDailyPay, dailyTarget, monthlyOpCosts, totalInvestment, fleet]);

  const fleetScaleData = useMemo(() => {
    const investPerUnit = totalInvestment / Math.max(fleet, 1);
    return Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const rev = simFare * simPax * simTrips * n * simWorkDays;
      const cost = (riderDailyPay * n * simWorkDays) + (monthlyOpCosts * n);
      const bonusPerRider = Math.max(0, (simFare * simPax * simTrips) - dailyTarget);
      const totalBonus = bonusPerRider * n * simWorkDays;
      const totalCost = cost + totalBonus;
      return { fleet: n, revenue: rev, cost: totalCost, profit: rev - totalCost };
    });
  }, [simFare, simPax, simTrips, simWorkDays, riderDailyPay, monthlyOpCosts, dailyTarget, totalInvestment, fleet]);


  // ══════════════════════════════════════════════════════════
  // ██ RISK ASSESSMENT
  // ══════════════════════════════════════════════════════════
  const risks = useMemo(() => {
    const items: Array<{ label: string; level: "low" | "medium" | "high"; score: number; detail: string; icon: string }> = [];

    // 1. Single-rider dependency
    const activeRiders = riderList.filter(r => r.status === "active").length;
    const riderDep = activeRiders <= 1 ? 90 : activeRiders <= 2 ? 60 : activeRiders <= 3 ? 30 : 10;
    items.push({
      label: "Rider Dependency",
      level: riderDep > 60 ? "high" : riderDep > 30 ? "medium" : "low",
      score: riderDep,
      detail: activeRiders <= 1 ? "Business relies on a single rider — very risky" : `${activeRiders} riders — ${riderDep <= 30 ? "well diversified" : "consider expanding"}`,
      icon: "👤",
    });

    // 2. Revenue volatility
    const volatility = avgDailyRevenue > 0 ? (revenueStdDev / avgDailyRevenue) * 100 : 0;
    const volScore = clamp(volatility, 0, 100);
    items.push({
      label: "Revenue Volatility",
      level: volScore > 50 ? "high" : volScore > 25 ? "medium" : "low",
      score: volScore,
      detail: `${Math.round(volatility)}% variation in daily earnings — ${volScore <= 25 ? "very stable" : volScore <= 50 ? "moderate fluctuation" : "unstable, needs attention"}`,
      icon: "📉",
    });

    // 3. Maintenance cost burden
    const maintenanceCosts = allMaintenance.reduce((s, m) => s + (m.total_cost || 0), 0);
    const maintPercent = totalRevenue > 0 ? (maintenanceCosts / totalRevenue) * 100 : 0;
    const maintScore = clamp(maintPercent * 2, 0, 100); // 50% of revenue = 100 risk
    items.push({
      label: "Maintenance Burden",
      level: maintScore > 60 ? "high" : maintScore > 30 ? "medium" : "low",
      score: maintScore,
      detail: `${Math.round(maintPercent)}% of revenue goes to maintenance — ${maintScore <= 30 ? "healthy" : maintScore <= 60 ? "watch closely" : "eating into profits"}`,
      icon: "🔧",
    });

    // 4. Fleet utilization gap
    const utilGap = fleet - activeRiders;
    const utilScore = fleet > 0 ? clamp((utilGap / fleet) * 100, 0, 100) : 0;
    items.push({
      label: "Fleet Idle Risk",
      level: utilScore > 50 ? "high" : utilScore > 20 ? "medium" : "low",
      score: utilScore,
      detail: utilGap <= 0 ? "All tricycles have assigned riders" : `${utilGap} tricycle${utilGap > 1 ? "s" : ""} without rider — losing potential revenue`,
      icon: "🛺",
    });

    // 5. Target achievement rate
    const daysAboveTarget = revenueValues.filter(v => v >= dailyTarget).length;
    const targetMissRate = daysWithData > 0 ? ((daysWithData - daysAboveTarget) / daysWithData) * 100 : 100;
    items.push({
      label: "Target Miss Rate",
      level: targetMissRate > 60 ? "high" : targetMissRate > 30 ? "medium" : "low",
      score: targetMissRate,
      detail: `Missing daily target ${Math.round(targetMissRate)}% of days — ${targetMissRate <= 30 ? "strong performance" : targetMissRate <= 60 ? "room for improvement" : "consistently underperforming"}`,
      icon: "🎯",
    });

    // 6. Fuel efficiency
    const fuelCosts = allFuel.reduce((s, f) => s + (f.cost || 0), 0);
    const fuelPercent = totalRevenue > 0 ? (fuelCosts / totalRevenue) * 100 : 0;
    const fuelScore = clamp(fuelPercent * 3, 0, 100); // 33% = max risk
    items.push({
      label: "Fuel Cost Risk",
      level: fuelScore > 60 ? "high" : fuelScore > 30 ? "medium" : "low",
      score: fuelScore,
      detail: `Fuel is ${Math.round(fuelPercent)}% of revenue — ${fuelScore <= 30 ? "efficient" : fuelScore <= 60 ? "monitor fuel costs" : "fuel costs too high"}`,
      icon: "⛽",
    });

    return items.sort((a, b) => b.score - a.score);
  }, [riderList, avgDailyRevenue, revenueStdDev, allMaintenance, totalRevenue, fleet, revenueValues, dailyTarget, daysWithData, allFuel]);


  // ══════════════════════════════════════════════════════════
  // ██ BREAK-EVEN TIMELINE
  // ══════════════════════════════════════════════════════════
  const breakEven = useMemo(() => {
    const dailyProfit = avgDailyRevenue - (riderDailyPay + monthlyOpCosts / workDays);
    const daysToBreakEven = dailyProfit > 0 ? Math.ceil(totalInvestment / dailyProfit) : Infinity;
    const monthsToBreakEven = daysToBreakEven !== Infinity ? Math.ceil(daysToBreakEven / workDays) : Infinity;
    const totalProfit = totalRevenue - totalExpenseAmount;
    const progressPct = totalInvestment > 0 ? clamp((totalProfit / totalInvestment) * 100, 0, 100) : 0;
    const dailyOpCostBE = monthlyOpCosts / workDays;
    const bestCaseDays = bestDayRevenue > (riderDailyPay + dailyOpCostBE) ? Math.ceil(totalInvestment / (bestDayRevenue - riderDailyPay - dailyOpCostBE)) : Infinity;
    const worstCaseDays = worstDayRevenue > (riderDailyPay + dailyOpCostBE) ? Math.ceil(totalInvestment / (worstDayRevenue - riderDailyPay - dailyOpCostBE)) : Infinity;

    // Projected date
    const now = new Date();
    const projected = new Date(now.getTime() + (daysToBreakEven - daysWithData) * 86400000);
    const projectedDate = daysToBreakEven !== Infinity && daysToBreakEven > daysWithData
      ? projected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : daysToBreakEven <= daysWithData ? "Already reached!" : "Not projected";

    return { dailyProfit, daysToBreakEven, monthsToBreakEven, progressPct, bestCaseDays, worstCaseDays, projectedDate };
  }, [avgDailyRevenue, riderDailyPay, monthlyOpCosts, workDays, totalInvestment, totalRevenue, totalExpenseAmount, bestDayRevenue, worstDayRevenue, daysWithData]);


  // ══════════════════════════════════════════════════════════
  // ██ MONTHLY P&L FORECAST
  // ══════════════════════════════════════════════════════════
  const monthlyPnL = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = new Date(2026, i).toLocaleString("en-GB", { month: "short" });
      const rev = projections.monthly.avg;
      const cost = projections.monthly.cost;
      // Add slight seasonal variation
      const seasonal = 1 + (Math.sin((i - 2) * Math.PI / 6) * 0.1); // peak in dry season
      const adjustedRev = rev * seasonal;
      const profit = adjustedRev - cost;
      return { month, revenue: Math.round(adjustedRev), cost: Math.round(cost), profit: Math.round(profit) };
    });
  }, [projections]);


  // ══════════════════════════════════════════════════════════
  // ██ GROWTH MILESTONES
  // ══════════════════════════════════════════════════════════
  const milestones = useMemo(() => {
    const items: Array<{ revenue: number; label: string; reached: boolean; icon: string }> = [];
    const monthlyRev = projections.monthly.avg;

    items.push({ revenue: 1000, label: "First ₵1,000 monthly", reached: monthlyRev >= 1000, icon: "🌱" });
    items.push({ revenue: 5000, label: "₵5K monthly revenue", reached: monthlyRev >= 5000, icon: "📈" });
    items.push({ revenue: 10000, label: "₵10K monthly — expansion ready", reached: monthlyRev >= 10000, icon: "🚀" });
    items.push({ revenue: 25000, label: "₵25K monthly — serious business", reached: monthlyRev >= 25000, icon: "💎" });
    items.push({ revenue: 50000, label: "₵50K monthly — fleet leader", reached: monthlyRev >= 50000, icon: "👑" });
    items.push({ revenue: 100000, label: "₵100K monthly — enterprise level", reached: monthlyRev >= 100000, icon: "🏆" });

    return items;
  }, [projections]);


  // ── Section expand/collapse ──
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    health: true, projections: true, riders: true, whatif: true,
    risk: true, breakeven: true, pnl: false, growth: false,
  });
  const toggle = useCallback((key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] })),
    []
  );

  const SectionToggle = ({ id, title, icon: Icon, badge }: { id: string; title: string; icon: React.ComponentType<{ className?: string }>; badge?: string }) => (
    <button onClick={() => toggle(id)}
      className="w-full flex items-center justify-between py-3 tap-active">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-bolt/10">
          <Icon className="h-4 w-4 text-bolt" />
        </div>
        <span className="text-sm font-bold text-gray-900 dark:text-white">{title}</span>
        {badge && <Badge variant="gray">{badge}</Badge>}
      </div>
      {expanded[id] ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
    </button>
  );


  // ════════════════════════════════════════════════════════
  // ██ RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-violet-500/20 to-bolt/20">
          <BrainCircuit className="h-5 w-5 text-bolt" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Simulations</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Smart projections & analytics</p>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 1. BUSINESS HEALTH SCORE                       */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="health" title="Business Health Score" icon={Activity} />
        {expanded.health && (
          <div className="space-y-4 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Think of this as a <strong className="text-gray-700 dark:text-gray-200">report card for your entire business</strong>. 
                It looks at everything — how much money you&apos;re making, whether your riders are doing well, if your tricycles are being used, 
                and whether you&apos;re actually making profit. The higher the score (out of 100), the healthier your business is. 
                Green means things are going great. Yellow means there&apos;s room to improve. Red means something needs fixing right away.
              </p>
            </div>

            {/* Big Gauge */}
            <HealthGauge score={healthScore.overall} label="Health" />

            {/* Grade badge */}
            <div className="flex justify-center">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl ${
                healthScore.overall >= 75 ? "bg-emerald-50 dark:bg-emerald-500/10" :
                healthScore.overall >= 50 ? "bg-gold/10" : "bg-danger/10"
              }`}>
                <span className={`text-2xl font-black ${grade(healthScore.overall).color}`}>
                  {grade(healthScore.overall).letter}
                </span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {healthScore.overall >= 80 ? "Excellent — Business thriving" :
                   healthScore.overall >= 60 ? "Good — Room to improve" :
                   healthScore.overall >= 40 ? "Fair — Needs attention" :
                   "Poor — Action required"}
                </span>
              </div>
            </div>

            {/* Breakdown bars */}
            <div className="space-y-3 pt-2">
              {healthScore.breakdown.map((item) => (
                <ScoreBar key={item.label} label={item.label} score={item.score} icon={item.icon} />
              ))}
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 2. REVENUE PROJECTIONS                         */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="projections" title="Revenue Projections" icon={TrendingUp} />
        {expanded.projections && (
          <div className="space-y-4 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                This shows you <strong className="text-gray-700 dark:text-gray-200">how much money you could be making</strong> based on your past performance. 
                We look at your best days, your average days, and your worst days, then project those into the future — 
                weekly, monthly, and yearly. The green bar is your best possible outcome, yellow is what you&apos;ll 
                most likely make, and red is the worst case. Costs are subtracted to show your actual take-home profit.
              </p>
            </div>

            {/* Scenario cards */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "Best Case", emoji: "🟢", key: "best" as const },
                { label: "Average", emoji: "🟡", key: "avg" as const },
                { label: "Worst Case", emoji: "🔴", key: "worst" as const },
              ]).map(s => (
                <div key={s.key} className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 text-center">
                  <span className="text-lg">{s.emoji}</span>
                  <p className="text-[10px] font-semibold text-gray-500 mt-1">{s.label}</p>
                  <p className="text-sm font-black text-gray-900 dark:text-white tabular mt-0.5">
                    {formatCurrency(projections.daily[s.key])}<span className="text-[10px] font-semibold text-gray-400">/day</span>
                  </p>
                </div>
              ))}
            </div>

            {/* extended projections */}
            <div className="divide-y divide-gray-100 dark:divide-surface-600">
              {([
                { period: "Weekly", data: projections.weekly },
                { period: "Monthly", data: projections.monthly },
                { period: "Yearly", data: projections.yearly },
              ]).map(p => (
                <div key={p.period} className="py-3 space-y-1.5">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{p.period} Forecast</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400">Revenue</p>
                        <p className="text-sm font-black text-bolt tabular">{formatCompact(p.data.avg)}</p>
                      </div>
                      <Minus className="h-3 w-3 text-gray-300" />
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400">Costs</p>
                        <p className="text-sm font-black text-danger tabular">{formatCompact(p.data.cost)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">Net Profit</p>
                      <p className={`text-sm font-black tabular ${p.data.avg - p.data.cost >= 0 ? "text-emerald-600" : "text-danger"}`}>
                        {p.data.avg - p.data.cost >= 0 ? "+" : ""}{formatCompact(p.data.avg - p.data.cost)}
                      </p>
                    </div>
                  </div>
                  {/* Range bar */}
                  <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                    <span className="tabular">{formatCompact(p.data.worst)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-surface-600 overflow-hidden relative">
                      <div className="absolute inset-y-0 bg-linear-to-r from-danger/30 via-gold/30 to-emerald-400/30 rounded-full"
                           style={{ left: "0%", right: "0%" }} />
                      <div className="absolute inset-y-0 w-1.5 bg-bolt rounded-full"
                           style={{ left: `${p.data.avg > 0 ? clamp(((p.data.avg - p.data.worst) / Math.max(p.data.best - p.data.worst, 1)) * 100, 5, 95) : 50}%` }} />
                    </div>
                    <span className="tabular">{formatCompact(p.data.best)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div className="h-44" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={projectionChartData} barCategoryGap="25%">
                  <XAxis dataKey="period" axisLine={false} tickLine={false}
                         tick={{ fontSize: 11, fontWeight: 700, fill: "#9CA3AF" }} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={false}
                    contentStyle={{ background: "#1F2937", border: "none", borderRadius: "12px", fontSize: "11px", fontWeight: 700, color: "#fff", padding: "8px 12px" }}
                    formatter={(v) => [formatCurrency(Number(v)), ""]}
                  />
                  <Bar dataKey="best" fill="#34D399" radius={[6, 6, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="avg" fill="#F5A623" radius={[6, 6, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="worst" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 3. RIDER PERFORMANCE MATRIX                    */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="riders" title="Rider Performance" icon={Users} badge={`${riderPerformance.length}`} />
        {expanded.riders && (
          <div className="space-y-3 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                This is like a <strong className="text-gray-700 dark:text-gray-200">school report for each rider</strong>. 
                Every rider gets scored out of 100 based on how much they earn each day, how often they hit their daily target, 
                how consistent they are (no lazy days!), and whether they submit their money on time. 
                Grade A+ means the rider is excellent. Grade F means they need serious help or a talk. 
                You&apos;ll also see a recommendation for each rider — what to do to help them improve or reward them.
              </p>
            </div>

            {riderPerformance.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No rider data yet</p>
            ) : (
              riderPerformance.map((rider, idx) => {
                const g = grade(rider.overallScore);
                return (
                  <div key={rider.id} className="rounded-xl border border-gray-100 dark:border-surface-600 overflow-hidden">
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-3 bg-surface-50 dark:bg-surface-700/50">
                      <div className="relative">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br
                          ${g.letter.startsWith("A") ? "from-emerald-400/20 to-emerald-600/20" :
                            g.letter === "B" ? "from-bolt/20 to-bolt-dark/20" :
                            g.letter === "C" ? "from-gold/20 to-gold-dark/20" :
                            "from-danger/20 to-red-600/20"}
                          text-sm font-black ${g.color}`}>
                          {rider.name?.charAt(0) || "?"}
                        </div>
                        <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black text-white ${g.bg}`}>
                          {g.letter}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{rider.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{rider.daysWorked} days</span>
                          <span className="text-[10px] text-gray-500">{rider.totalTrips} trips</span>
                          <span className="text-[10px] font-bold text-bolt tabular">{formatCurrency(rider.totalRev)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-black ${g.color}`}>{Math.round(rider.overallScore)}</p>
                        <p className="text-[9px] text-gray-400">SCORE</p>
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <p className="text-[10px] text-gray-400">Avg Revenue/Day</p>
                          <p className="text-xs font-bold text-gray-800 dark:text-white tabular">{formatCurrency(rider.avgRevPerDay)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Avg Trips/Day</p>
                          <p className="text-xs font-bold text-gray-800 dark:text-white tabular">{rider.avgTripsPerDay.toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Target Hit Rate</p>
                          <p className={`text-xs font-bold tabular ${rider.targetHitRate >= 70 ? "text-emerald-600" : rider.targetHitRate >= 40 ? "text-gold" : "text-danger"}`}>
                            {Math.round(rider.targetHitRate)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Remit Compliance</p>
                          <p className={`text-xs font-bold tabular ${rider.remitCompliance >= 80 ? "text-emerald-600" : rider.remitCompliance >= 50 ? "text-gold" : "text-danger"}`}>
                            {Math.round(rider.remitCompliance)}%
                          </p>
                        </div>
                      </div>

                      {/* Score bars */}
                      <ScoreBar label="Target Achievement" score={rider.targetHitRate} icon="🎯" />
                      <ScoreBar label="Consistency" score={rider.consistency} icon="📊" />

                      {/* Recommendation */}
                      <div className={`rounded-lg p-2.5 mt-2 ${
                        rider.overallScore >= 75 ? "bg-emerald-50 dark:bg-emerald-500/10" :
                        rider.overallScore >= 50 ? "bg-gold/10" : "bg-danger/10"
                      }`}>
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          {rider.overallScore >= 80 ? "⭐ Top performer — consider rewards or mentorship role" :
                           rider.overallScore >= 60 ? "💪 Solid rider — encourage to push harder on daily target" :
                           rider.overallScore >= 40 ? "⚠️ Below average — needs coaching on trip frequency" :
                           "🔴 Underperforming — review rider commitment and support needed"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 4. WHAT-IF SIMULATOR                           */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="whatif" title="What-If Simulator" icon={Sparkles} />
        {expanded.whatif && (
          <div className="space-y-5 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                This is your <strong className="text-gray-700 dark:text-gray-200">dream planner</strong>. 
                Drag the sliders to ask questions like: &quot;What if I had 5 tricycles instead of 1?&quot; or 
                &quot;What if I raised the fare to ₵5?&quot; or &quot;What if each rider did 30 trips a day?&quot; 
                The numbers below will instantly change to show you how much you&apos;d make, how much you&apos;d spend, 
                and how much profit you&apos;d take home. It also shows you when you&apos;d get your money back (break-even) 
                and your return on investment (ROI). Play with it — it&apos;s free to dream!
              </p>
            </div>

            {/* Sliders */}
            <div className="space-y-4">
              <Slider label="Fleet Size" value={simFleet} onChange={setSimFleet} min={1} max={20} unit=" tricycles" />
              <Slider label="Fare per Passenger" value={simFare} onChange={setSimFare} min={1} max={15} prefix="₵" />
              <Slider label="Trips per Day" value={simTrips} onChange={setSimTrips} min={5} max={50} unit=" trips" />
              <Slider label="Passengers per Trip" value={simPax} onChange={setSimPax} min={1} max={6} unit=" pax" />
              <Slider label="Working Days/Month" value={simWorkDays} onChange={setSimWorkDays} min={20} max={30} unit=" days" />
            </div>

            {/* Results */}
            <div className="rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-bolt" />
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Simulation Results</p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-gray-400">Daily Revenue</p>
                  <p className="text-lg font-black text-white tabular">{formatCurrency(whatIfResults.dailyRevTotal)}</p>
                  <p className="text-[10px] text-gray-500 tabular">{formatCurrency(whatIfResults.dailyRevPerUnit)}/unit</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-gray-400">Monthly Revenue</p>
                  <p className="text-lg font-black text-bolt tabular">{formatCompact(whatIfResults.monthlyRev)}</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-gray-400">Monthly Costs</p>
                  <p className="text-lg font-black text-danger tabular">{formatCompact(whatIfResults.monthlyCost)}</p>
                  <p className="text-[10px] text-gray-500">Riders + Ops</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-gray-400">Monthly Profit</p>
                  <p className={`text-lg font-black tabular ${whatIfResults.monthlyProfit >= 0 ? "text-emerald-400" : "text-danger"}`}>
                    {whatIfResults.monthlyProfit >= 0 ? "+" : ""}{formatCompact(whatIfResults.monthlyProfit)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">Yearly Profit</p>
                  <p className={`text-sm font-black tabular ${whatIfResults.yearlyProfit >= 0 ? "text-emerald-400" : "text-danger"}`}>
                    {formatCompact(whatIfResults.yearlyProfit)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">Break-even</p>
                  <p className="text-sm font-black text-gold tabular">
                    {whatIfResults.monthsToBreakEven === Infinity ? "N/A" : `${whatIfResults.monthsToBreakEven} mo`}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">ROI</p>
                  <p className={`text-sm font-black tabular ${whatIfResults.roi >= 0 ? "text-emerald-400" : "text-danger"}`}>
                    {whatIfResults.roi.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Fleet Scaling Chart */}
            <div>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Monthly Profit by Fleet Size</p>
              <div className="h-44" style={{ minWidth: 0 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={fleetScaleData} barCategoryGap="15%">
                    <XAxis dataKey="fleet" axisLine={false} tickLine={false}
                           tick={{ fontSize: 10, fontWeight: 700, fill: "#9CA3AF" }}
                           label={{ value: "Tricycles", position: "insideBottom", offset: -2, fontSize: 9, fill: "#9CA3AF" }} />
                    <YAxis hide />
                    <Tooltip
                      cursor={false}
                      contentStyle={{ background: "#1F2937", border: "none", borderRadius: "12px", fontSize: "11px", fontWeight: 700, color: "#fff", padding: "8px 12px" }}
                      formatter={(v) => [formatCurrency(Number(v)), ""]}
                    />
                    <Bar dataKey="profit" radius={[6, 6, 0, 0]} maxBarSize={24}>
                      {fleetScaleData.map((entry, i) => (
                        <Cell key={i} fill={entry.profit >= 0 ? (i + 1 === simFleet ? "#34D399" : "#34D39960") : "#EF4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Insights */}
            <div className="space-y-2">
              {whatIfResults.monthlyProfit > 0 && whatIfResults.dailyBonusTotal > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-gold/10 p-3">
                  <span className="text-sm">💡</span>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    Riders earn bonuses of {formatCurrency(whatIfResults.dailyBonusTotal)}/day above ₵{dailyTarget} target.
                    That&apos;s {formatCurrency(whatIfResults.dailyBonusTotal * simWorkDays)}/month in bonus payouts.
                  </p>
                </div>
              )}
              {simFleet > fleet && (
                <div className="flex items-start gap-2 rounded-xl bg-bolt/10 p-3">
                  <span className="text-sm">🛺</span>
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    Scaling from {fleet} to {simFleet} tricycles requires ~{formatCurrency(whatIfResults.totalNewInvestment - totalInvestment)} additional investment.
                    {whatIfResults.monthsToBreakEven !== Infinity
                      ? ` You'd break even in ${whatIfResults.monthsToBreakEven} months.`
                      : " Consider reducing costs to achieve profitability."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 5. RISK ASSESSMENT                             */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="risk" title="Risk Assessment" icon={ShieldAlert}
                       badge={`${risks.filter(r => r.level === "high").length} high`} />
        {expanded.risk && (
          <div className="space-y-2.5 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Every business has risks — things that could go wrong and cost you money. This section 
                <strong className="text-gray-700 dark:text-gray-200"> identifies your biggest dangers</strong> right now. 
                For example: Are you relying on just one rider? (If they quit, you lose everything.) 
                Is your revenue unpredictable? Are repairs eating your profit? 
                Red means high danger — fix it soon. Yellow means watch it. Green means you&apos;re safe in that area.
              </p>
            </div>

            {risks.map((risk, i) => (
              <div key={i} className={`rounded-xl border overflow-hidden ${
                risk.level === "high" ? "border-danger/30 bg-danger/5" :
                risk.level === "medium" ? "border-gold/30 bg-gold/5" :
                "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5"
              }`}>
                <div className="flex items-center gap-3 p-3">
                  <span className="text-lg">{risk.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-800 dark:text-white">{risk.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        risk.level === "high" ? "bg-danger/20 text-danger" :
                        risk.level === "medium" ? "bg-gold/20 text-gold-dark" :
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                      }`}>{risk.level}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{risk.detail}</p>
                  </div>
                  <div className="shrink-0">
                    {risk.level === "high" ? <ShieldX className="h-5 w-5 text-danger" /> :
                     risk.level === "medium" ? <ShieldAlert className="h-5 w-5 text-gold" /> :
                     <ShieldCheck className="h-5 w-5 text-emerald-500" />}
                  </div>
                </div>
                {/* Risk bar */}
                <div className="h-1.5">
                  <div className={`h-full transition-all duration-700 ${
                    risk.level === "high" ? "bg-danger" : risk.level === "medium" ? "bg-gold" : "bg-emerald-400"
                  }`} style={{ width: `${risk.score}%` }} />
                </div>
              </div>
            ))}

            {/* Overall Risk Level */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Overall Risk Level</span>
                {(() => {
                  const avgRisk = avg(risks.map(r => r.score));
                  return (
                    <span className={`text-xs font-black ${
                      avgRisk > 50 ? "text-danger" : avgRisk > 30 ? "text-gold" : "text-emerald-600"
                    }`}>
                      {avgRisk > 50 ? "HIGH" : avgRisk > 30 ? "MODERATE" : "LOW"} ({Math.round(avgRisk)}%)
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 6. BREAK-EVEN TIMELINE                         */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="breakeven" title="Break-Even Analysis" icon={PiggyBank} />
        {expanded.breakeven && (
          <div className="space-y-4 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                When you started this business, you spent money to buy the tricycle, register it, get insurance, and so on. 
                This section tells you <strong className="text-gray-700 dark:text-gray-200">when you&apos;ll get all that money back</strong> 
                from the daily earnings. Once the bar hits 100%, you&apos;ve recovered your full investment — 
                from that point on, everything you earn is pure profit. We also show you the best and worst case 
                scenarios so you know what to expect.
              </p>
            </div>

            {totalInvestment > 0 ? (
              <>
                {/* Progress */}
                <div className="text-center">
                  <p className={`text-4xl font-black ${breakEven.progressPct >= 100 ? "text-emerald-600" : "text-bolt"}`}>
                    {Math.round(breakEven.progressPct)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">of investment recovered</p>
                </div>

                <div className="h-4 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ease-out ${
                    breakEven.progressPct >= 100 ? "bg-linear-to-r from-emerald-400 to-emerald-600" :
                    "bg-linear-to-r from-bolt to-gold"
                  }`} style={{ width: `${breakEven.progressPct}%` }} />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 text-center">
                    <p className="text-[10px] text-gray-400">Investment</p>
                    <p className="text-sm font-black text-gray-900 dark:text-white tabular">{formatCurrency(totalInvestment)}</p>
                  </div>
                  <div className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 text-center">
                    <p className="text-[10px] text-gray-400">Recovered</p>
                    <p className="text-sm font-black text-bolt tabular">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 text-center">
                    <p className="text-[10px] text-gray-400">Daily Profit Rate</p>
                    <p className={`text-sm font-black tabular ${breakEven.dailyProfit >= 0 ? "text-emerald-600" : "text-danger"}`}>
                      {formatCurrency(breakEven.dailyProfit)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-50 dark:bg-surface-700 p-3 text-center">
                    <p className="text-[10px] text-gray-400">Projected Date</p>
                    <p className="text-xs font-black text-gold">{breakEven.projectedDate}</p>
                  </div>
                </div>

                {/* Scenarios */}
                <div className="divide-y divide-gray-100 dark:divide-surface-600">
                  {([
                    { label: "Best Case", days: breakEven.bestCaseDays, emoji: "🟢" },
                    { label: "Average Case", days: breakEven.daysToBreakEven, emoji: "🟡" },
                    { label: "Worst Case", days: breakEven.worstCaseDays, emoji: "🔴" },
                  ]).map(s => (
                    <div key={s.label} className="flex items-center justify-between py-2.5">
                      <span className="text-xs text-gray-500 flex items-center gap-1.5">
                        <span>{s.emoji}</span> {s.label}
                      </span>
                      <span className="text-xs font-black text-gray-800 dark:text-white tabular">
                        {s.days === Infinity ? "N/A" : `${s.days} days (~${Math.ceil(s.days / 30)} months)`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <PiggyBank className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Enter your initial investment in Settings to see break-even analysis</p>
              </div>
            )}
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 7. MONTHLY P&L FORECAST                        */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="pnl" title="12-Month P&L Forecast" icon={BadgeDollarSign} />
        {expanded.pnl && (
          <div className="space-y-4 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                P&amp;L stands for <strong className="text-gray-700 dark:text-gray-200">Profit and Loss</strong> — 
                it&apos;s a fancy way of saying &quot;how much money comes in vs how much goes out.&quot; 
                This chart shows you what the next 12 months could look like. The gold line is your revenue (money coming in), 
                the red line is your costs (money going out), and the green line is your profit (what&apos;s left for you). 
                If the green line stays above zero, your business is healthy. If it dips below, you&apos;re losing money that month.
              </p>
            </div>

            {/* Chart */}
            <div className="h-48" style={{ minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={monthlyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false}
                         tick={{ fontSize: 9, fontWeight: 700, fill: "#9CA3AF" }} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ background: "#1F2937", border: "none", borderRadius: "12px", fontSize: "11px", fontWeight: 700, color: "#fff", padding: "8px 12px" }}
                    formatter={(v) => [formatCurrency(Number(v)), ""]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#F5A623" fill="#F5A62320" strokeWidth={2} />
                  <Area type="monotone" dataKey="cost" stroke="#EF4444" fill="#EF444420" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" stroke="#34D399" fill="#34D39920" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4">
              {[{ color: "bg-gold", label: "Revenue" }, { color: "bg-danger", label: "Costs" }, { color: "bg-emerald-400", label: "Profit" }].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${l.color}`} />
                  <span className="text-[10px] font-semibold text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Annual totals */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-surface-600">
              <div className="text-center">
                <p className="text-[10px] text-gray-400">Annual Revenue</p>
                <p className="text-sm font-black text-gold tabular">{formatCompact(monthlyPnL.reduce((s, m) => s + m.revenue, 0))}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">Annual Costs</p>
                <p className="text-sm font-black text-danger tabular">{formatCompact(monthlyPnL.reduce((s, m) => s + m.cost, 0))}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">Annual Profit</p>
                <p className="text-sm font-black text-emerald-600 tabular">{formatCompact(monthlyPnL.reduce((s, m) => s + m.profit, 0))}</p>
              </div>
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 8. GROWTH ROADMAP                              */}
      {/* ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden">
        <SectionToggle id="growth" title="Growth Roadmap" icon={Flame} />
        {expanded.growth && (
          <div className="space-y-2 pt-2">
            {/* Explanation */}
            <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3">
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                These are your <strong className="text-gray-700 dark:text-gray-200">business goals — like levels in a game</strong>. 
                Each milestone represents a monthly revenue target. As your business grows, you&apos;ll unlock bigger levels — 
                from earning your first ₵1,000 per month all the way up to ₵100,000. 
                Checkmarks mean you&apos;ve already reached that level. The AI recommendations at the bottom give you 
                practical tips on what to do next to keep growing — like adding more tricycles or improving routes.
              </p>
            </div>

            {milestones.map((m, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                m.reached ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-surface-50 dark:bg-surface-700"
              }`}>
                <span className="text-xl">{m.reached ? "✅" : m.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${m.reached ? "text-emerald-700 dark:text-emerald-400" : "text-gray-700 dark:text-gray-300"}`}>
                    {m.label}
                  </p>
                  <p className="text-[10px] text-gray-400 tabular">{formatCurrency(m.revenue)}/month target</p>
                </div>
                {m.reached ? (
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Reached</span>
                ) : (
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Pending</span>
                )}
              </div>
            ))}

            {/* Smart recommendations */}
            <div className="rounded-xl bg-linear-to-br from-bolt/10 to-violet-500/10 p-4 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <BrainCircuit className="h-4 w-4 text-bolt" />
                <p className="text-xs font-bold text-gray-800 dark:text-white">AI Recommendations</p>
              </div>
              <div className="space-y-2 text-[11px] text-gray-600 dark:text-gray-300">
                {fleet <= 1 && (
                  <p>• With {fleet} tricycle, focus on maximizing trips per day ({tripsPerDay}+) before expanding fleet</p>
                )}
                {avgDailyRevenue < dailyTarget && (
                  <p>• Daily revenue (₵{Math.round(avgDailyRevenue)}) is below target (₵{dailyTarget}). Consider more trips, higher fares, or better routes</p>
                )}
                {avgDailyRevenue >= dailyTarget && fleet <= 2 && (
                  <p>• Consistently hitting targets — consider adding another tricycle to multiply profit</p>
                )}
                {riderPerformance.some(r => r.overallScore < 50) && (
                  <p>• Some riders are underperforming — invest in training or consider replacement</p>
                )}
                {monthlyOpCosts > projections.monthly.avg * 0.3 && (
                  <p>• Operating costs are {Math.round((monthlyOpCosts / Math.max(projections.monthly.avg, 1)) * 100)}% of revenue — look for ways to reduce overhead</p>
                )}
                {whatIfResults.roi > 100 && (
                  <p>• ROI at current settings is {whatIfResults.roi.toFixed(0)}% — excellent business opportunity for investors</p>
                )}
                <p>• At {simTrips} trips/day & ₵{simFare}/pax, each tricycle generates {formatCurrency(simFare * simPax * simTrips)}/day</p>
                {projections.yearly.avg > 0 && (
                  <p>• Projected annual revenue: {formatCompact(projections.yearly.avg)} with {formatCompact(projections.yearly.avg - projections.yearly.cost)} profit</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>


      {/* ══════════════════════════════════════════════════ */}
      {/* ██ 9. QUICK INSIGHTS SUMMARY                      */}
      {/* ══════════════════════════════════════════════════ */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-gold" />
          <p className="text-sm font-bold text-gray-900 dark:text-white">Key Insights</p>
        </div>
        {/* Explanation */}
        <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 p-3 mb-3">
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            A <strong className="text-gray-700 dark:text-gray-200">quick summary of the most important numbers</strong> in your business. 
            How much each tricycle earns you per day, how many trips they do, whether your income is steady or all over the place, 
            and what your profit margin looks like. Think of it as a cheat sheet — one glance and you know how things are going.
          </p>
        </div>
        <div className="space-y-2">
          {/* Revenue efficiency */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600">
            <span className="text-[11px] text-gray-500">Revenue per Tricycle/Day</span>
            <span className="text-xs font-black text-bolt tabular">{formatCurrency(revenuePerTricycle)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600">
            <span className="text-[11px] text-gray-500">Avg Trips per Tricycle/Day</span>
            <span className="text-xs font-black text-gray-800 dark:text-white tabular">{tripsPerTricyclePerDay.toFixed(1)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600">
            <span className="text-[11px] text-gray-500">Revenue Consistency</span>
            <span className={`text-xs font-black tabular ${revenueConsistency >= 70 ? "text-emerald-600" : revenueConsistency >= 40 ? "text-gold" : "text-danger"}`}>
              {Math.round(revenueConsistency)}%
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600">
            <span className="text-[11px] text-gray-500">Profit Margin</span>
            <span className={`text-xs font-black tabular ${totalRevenue - totalExpenseAmount >= 0 ? "text-emerald-600" : "text-danger"}`}>
              {totalRevenue > 0 ? Math.round(((totalRevenue - totalExpenseAmount) / totalRevenue) * 100) : 0}%
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-surface-600">
            <span className="text-[11px] text-gray-500">Best Day Ever</span>
            <span className="text-xs font-black text-gold tabular">{formatCurrency(bestDayRevenue)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-gray-500">Days of Data</span>
            <span className="text-xs font-black text-gray-800 dark:text-white tabular">{daysWithData}</span>
          </div>
        </div>
      </Card>

    </div>
  );
}
