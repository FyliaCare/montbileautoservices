"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatTime, todayISO, timeAgo } from "@/lib/utils";
import { DEFAULTS } from "@/lib/constants";
import {
  LayoutDashboard, TrendingUp, TrendingDown, Navigation,
  Wallet, Truck, Users, Fuel, Calendar, ChevronRight,
  DollarSign, Target, BarChart3, Zap, PiggyBank,
  AlertTriangle, Banknote, Wrench, FileWarning, Clock,
  MapPin
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";

// Dynamic import of map (Leaflet must be client-only, no SSR)
const RiderMap = dynamic(() => import("@/components/rider-map").then(m => m.RiderMap), { ssr: false });

export default function ManagementDashboard() {
  const {
    isConnected, isLoading, dailyLogs, expenses, payments,
    riders, settings, appShifts, appTrips, appRemittances,
    maintenance, documents, leaveRequests, incidents,
    riderLocations,
  } = useFirebaseStore(useShallow((s) => ({
    isConnected: s.isConnected,
    isLoading: s.isLoading,
    dailyLogs: s.dailyLogs,
    expenses: s.expenses,
    payments: s.payments,
    riders: s.riders,
    settings: s.settings,
    appShifts: s.appShifts,
    appTrips: s.appTrips,
    appRemittances: s.appRemittances,
    maintenance: s.maintenance,
    documents: s.documents,
    leaveRequests: s.leaveRequests,
    incidents: s.incidents,
    riderLocations: s.riderLocations,
  })));

  const todayLogs = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.values(dailyLogs).filter((l) => l.date === today);
  }, [dailyLogs]);

  // ── Real-time active shifts & live trips ──
  const activeShifts = useMemo(() =>
    Object.entries(appShifts)
      .filter(([, s]) => s.status === "active")
      .map(([id, s]) => ({ ...s, id })),
    [appShifts]
  );

  const todayTripsLive = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.entries(appTrips)
      .filter(([, t]) => t.created_at?.startsWith(today))
      .map(([id, t]) => ({ ...t, id }));
  }, [appTrips]);

  const liveTripsCount = todayTripsLive.length;
  const liveEarnings = todayTripsLive.reduce((s, t) => s + (t.fare_amount || 0), 0);

  const todayRevenue = todayLogs.reduce((s, l) => s + (l.total_revenue || 0), 0);
  const todayTrips = todayLogs.reduce((s, l) => s + (l.trips || 0), 0);
  // Show whichever is higher — live trips during active shifts, or completed daily logs
  const displayRevenue = Math.max(todayRevenue, liveEarnings);
  const displayTrips = Math.max(todayTrips, liveTripsCount);
  const totalRevenue = useMemo(() =>
    Object.values(dailyLogs).reduce((s, l) => s + (l.total_revenue || 0), 0), [dailyLogs]);
  const totalExpenses = useMemo(() =>
    Object.values(expenses).reduce((s, e) => s + (e.amount || 0), 0), [expenses]);
  const riderList = useMemo(() =>
    Object.entries(riders).map(([id, r]) => ({ ...r, id })), [riders]);
  const activeRiders = riderList.filter((r) => r.status === "active").length;

  const fleet = settings?.fleet || DEFAULTS.fleet;
  const fare = settings?.fare || DEFAULTS.fare;
  const pax = settings?.pax || DEFAULTS.pax;
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const projectedDaily = fare * pax * (settings?.trips || DEFAULTS.trips);

  // Recent activity
  const recentLogs = Object.entries(dailyLogs)
    .map(([id, l]) => ({ ...l, id }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const totalPayments = Object.values(payments).reduce((s, p) => s + (p.amount || 0), 0);
  const profit = totalRevenue - totalExpenses;

  // ── Weekly revenue data for chart ──
  const weekDays = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const monOffset = dow === 0 ? -6 : 1 - dow;
    const days: Array<{ label: string; date: string; revenue: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + monOffset + i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayRevenue = Object.values(dailyLogs)
        .filter((l) => l.date === dateStr)
        .reduce((s, l) => s + (l.total_revenue || 0), 0);
      days.push({
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        date: dateStr,
        revenue: dayRevenue,
      });
    }
    return days;
  }, [dailyLogs]);

  const weekTotal = weekDays.reduce((s, d) => s + d.revenue, 0);

  // ── Break-even calculation ──
  const totalInvestment = useMemo(() => {
    if (!settings) return 0;
    return (settings.bike_cost || 0) + (settings.transport || 0) + (settings.dvla || 0) +
      (settings.veh_reg || 0) + (settings.tracker || 0) + (settings.ins_setup || 0) +
      (settings.permit_setup || 0) + (settings.misc_start || 0);
  }, [settings]);

  const breakEvenProgress = totalInvestment > 0 ? Math.min(((totalRevenue - totalExpenses) / totalInvestment) * 100, 100) : 0;
  const breakEvenReached = breakEvenProgress >= 100;

  // ── Today's remittance summary ──
  const todayRemittances = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return Object.values(appRemittances).filter((r) => r.remittance_date === today);
  }, [appRemittances]);
  const remittanceCollected = todayRemittances.reduce((s, r) => s + r.amount, 0);
  // Expected remittance = total live earnings (riders submit everything)
  const remittanceExpected = Math.max(liveEarnings, todayRevenue);
  const pendingRemittances = todayRemittances.filter((r) => r.status === "pending").length;

  // Calculate what management owes riders today
  const totalRiderPayables = useMemo(() => {
    let totalDailyPay = 0;
    let totalBonus = 0;
    // Count unique riders who worked today (from shifts or logs)
    const riderIds = new Set<string>();
    activeShifts.forEach(s => riderIds.add(s.rider_id));
    todayLogs.forEach(l => {
      const riderEntry = Object.entries(riders).find(([, r]) => r.name === l.rider);
      if (riderEntry) riderIds.add(riderEntry[0]);
    });
    totalDailyPay = riderIds.size * riderDailyPay;
    // Calculate bonuses from live data
    activeShifts.forEach(shift => {
      const shiftTrips = todayTripsLive.filter(t => t.shift_id === shift.id);
      const shiftEarnings = shiftTrips.reduce((s, t) => s + (t.fare_amount || 0), 0);
      totalBonus += Math.max(0, shiftEarnings - dailyTarget);
    });
    return { totalDailyPay, totalBonus, total: totalDailyPay + totalBonus, riderCount: riderIds.size };
  }, [activeShifts, todayLogs, riders, riderDailyPay, todayTripsLive, dailyTarget]);

  // ── Proactive alerts ──
  const alerts = useMemo(() => {
    const items: Array<{ icon: string; text: string; severity: "warning" | "info" | "danger" }> = [];
    const today = new Date();

    // Maintenance alerts - last service > 30 days ago
    const lastServiceDate = Object.values(maintenance)
      .map((m) => m.date)
      .sort((a, b) => b.localeCompare(a))[0];
    if (lastServiceDate) {
      const daysSince = Math.floor((today.getTime() - new Date(lastServiceDate).getTime()) / 86400000);
      if (daysSince > 30) {
        items.push({ icon: "🔧", text: `Last service was ${daysSince} days ago — maintenance may be due`, severity: "warning" });
      }
    } else {
      items.push({ icon: "🔧", text: "No service records yet — schedule your first maintenance", severity: "info" });
    }

    // Document expiry alerts
    Object.values(documents).forEach((doc) => {
      if (doc.expiry_date) {
        const daysUntil = Math.floor((new Date(doc.expiry_date).getTime() - today.getTime()) / 86400000);
        if (daysUntil <= 0) {
          items.push({ icon: "🔴", text: `${doc.name} has EXPIRED`, severity: "danger" });
        } else if (daysUntil <= 7) {
          items.push({ icon: "⚠️", text: `${doc.name} expires in ${daysUntil} day${daysUntil !== 1 ? "s" : ""}`, severity: "warning" });
        } else if (daysUntil <= 30) {
          items.push({ icon: "📄", text: `${doc.name} expires in ${daysUntil} days`, severity: "info" });
        }
      }
    });

    // Pending leave requests
    const pendingLeaves = Object.values(leaveRequests).filter((l) => l.status === "pending");
    if (pendingLeaves.length > 0) {
      items.push({ icon: "📅", text: `${pendingLeaves.length} pending leave request${pendingLeaves.length > 1 ? "s" : ""}`, severity: "info" });
    }

    // Open incidents
    const openIncidents = Object.values(incidents).filter((i) => i.status !== "resolved");
    if (openIncidents.length > 0) {
      items.push({ icon: "🚨", text: `${openIncidents.length} open incident${openIncidents.length > 1 ? "s" : ""}`, severity: openIncidents.some(i => i.severity === "high") ? "danger" : "warning" });
    }

    // Outstanding balance
    const totalPaid = settings?.total_paid || 0;
    const outstandingBalance = totalInvestment - totalPaid;
    if (outstandingBalance > 0) {
      items.push({ icon: "💰", text: `Outstanding balance: ${formatCurrency(outstandingBalance)} still owed`, severity: "info" });
    }

    return items;
  }, [maintenance, documents, leaveRequests, incidents, settings, totalInvestment]);

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
            <LayoutDashboard className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && <Badge variant="green" dot>Live</Badge>}
          {isLoading && <Badge variant="gray">Syncing…</Badge>}
        </div>
      </div>

      {/* Hero revenue card */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 p-5">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold/10 blur-2xl" />
        <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-gold/5 blur-xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Today&apos;s Revenue</p>
            {activeShifts.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-bolt/20 px-2 py-0.5 text-[10px] font-bold text-bolt">
                <span className="h-1.5 w-1.5 rounded-full bg-bolt animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <p className="mt-1 text-3xl font-black text-white tabular">{formatCurrency(displayRevenue)}</p>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 text-gold" />
              <span className="text-sm font-semibold text-gray-300 tabular">{displayTrips} trips</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-bolt" />
              <span className="text-sm font-semibold text-gray-300 tabular">{activeShifts.length > 0 ? `${activeShifts.length} on shift` : `${todayLogs.length} riders today`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 gap-3">
        <StatCard label="All Revenue" value={`₵${Math.round(totalRevenue)}`} color="gold" />
        <StatCard label="Expenses" value={`₵${Math.round(totalExpenses)}`} color="danger" />
        <StatCard label="Profit" value={`₵${Math.round(profit)}`} color={profit >= 0 ? "bolt" : "danger"} />
      </div>

      {/* ── Live Map ── */}
      <SectionHeader title={(() => {
        const locEntries = Object.values(riderLocations);
        const activeCount = locEntries.filter(l => l.status === "active").length;
        const idleCount = locEntries.length - activeCount;
        const parts: string[] = [];
        if (activeCount > 0) parts.push(`${activeCount} live`);
        if (idleCount > 0) parts.push(`${idleCount} offline`);
        return `Live Map (${parts.length > 0 ? parts.join(", ") : "0 riders"})`;
      })()} />
      <Card className="p-0! overflow-hidden">
        <div className="h-[28rem] sm:h-[32rem] overflow-hidden">
          <RiderMap locations={riderLocations} height="100%" />
        </div>
        {Object.keys(riderLocations).length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-surface-600">
            <MapPin className="h-4 w-4 text-gray-400" />
            <p className="text-xs text-gray-400">Rider locations appear here when shifts are active</p>
          </div>
        )}
      </Card>

      {/* ── Per-Rider Live Earnings ── */}
      {activeShifts.length > 0 && (
        <>
          <SectionHeader title={`Rider Earnings — LIVE`} />
          <div className="space-y-2">
            {activeShifts.map((shift) => {
              const riderObj = Object.entries(riders).find(([id]) => id === shift.rider_id);
              const displayName = riderObj ? riderObj[1].name : shift.rider_id;
              const initial = displayName?.charAt(0) || "?";
              const shiftTrips = todayTripsLive.filter(t => t.shift_id === shift.id);
              const shiftEarnings = shiftTrips.reduce((s, t) => s + (t.fare_amount || 0), 0);
              const riderBonus = Math.max(0, shiftEarnings - dailyTarget);
              const latestTrip = shiftTrips.length > 0
                ? shiftTrips.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
                : null;
              const loc = riderLocations[shift.rider_id];
              const isActive = loc?.status === "active";
              const isIdle = loc && loc.status !== "active";

              return (
                <Card key={shift.id} className="p-0! overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    {/* Tricycle Avatar */}
                    <div className="relative shrink-0">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        isActive
                          ? "bg-linear-to-br from-emerald-400 to-emerald-600 text-white"
                          : isIdle
                          ? "bg-linear-to-br from-gray-300 to-gray-500 text-white"
                          : "bg-linear-to-br from-bolt to-bolt-dark text-white"
                      }`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="5" cy="18" r="3"/>
                          <circle cx="19" cy="18" r="3"/>
                          <circle cx="12" cy="18" r="3"/>
                          <path d="M12 15V7l-4 4h8"/>
                          <path d="M5 15L9 7"/>
                          <path d="M19 15l-4-8"/>
                        </svg>
                        {/* Initial badge */}
                        <span className={`absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow text-[9px] font-black ${
                          isActive ? "text-emerald-600" : isIdle ? "text-gray-500" : "text-bolt"
                        }`}>
                          {initial}
                        </span>
                      </div>
                      {/* Status dot */}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-surface-800 ${
                        isActive
                          ? "bg-emerald-500 animate-pulse"
                          : isIdle
                          ? "bg-gray-400"
                          : "bg-bolt animate-pulse"
                      }`} />
                    </div>

                    {/* Name + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{displayName}</p>
                        {isActive ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            LIVE
                          </span>
                        ) : isIdle ? (
                          <span className="flex items-center gap-1 rounded-full bg-gray-200 dark:bg-surface-600 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            OFFLINE
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-bolt/15 px-1.5 py-0.5 text-[9px] font-bold text-bolt whitespace-nowrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-bolt animate-pulse" />
                            ON SHIFT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-gray-500">{shiftTrips.length} trips</span>
                        {loc && (
                          <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {loc.speed != null && loc.speed > 0 ? `${Math.round(loc.speed * 3.6)} km/h` : "Stationary"}
                          </span>
                        )}
                        {latestTrip && (
                          <span className="text-[11px] text-gray-400">Last: {formatTime(latestTrip.trip_time || latestTrip.created_at)}</span>
                        )}
                      </div>
                    </div>

                    {/* Earnings */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-bolt tabular">{formatCurrency(shiftEarnings)}</p>
                      {riderBonus > 0 ? (
                        <p className="text-[10px] font-semibold text-gold uppercase">+₵{riderBonus} bonus</p>
                      ) : (
                        <p className="text-[10px] font-semibold text-gray-400 uppercase">earned</p>
                      )}
                    </div>
                  </div>

                  {/* Owed to rider */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-surface-50 dark:bg-surface-700 border-t border-gray-100 dark:border-surface-600">
                    <span className="text-[10px] font-semibold text-gray-500">Owe rider:</span>
                    <span className="text-[11px] font-bold text-bolt tabular">
                      ₵{riderDailyPay}{riderBonus > 0 ? ` + ₵${riderBonus} bonus` : ""} = {formatCurrency(riderDailyPay + riderBonus)}
                    </span>
                  </div>

                  {/* Trip progress bar */}
                  <div className="h-1 bg-gray-100 dark:bg-surface-700">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isActive
                          ? "bg-linear-to-r from-emerald-400 to-emerald-600"
                          : isIdle
                          ? "bg-linear-to-r from-gray-300 to-gray-400"
                          : "bg-linear-to-r from-bolt to-bolt-dark"
                      }`}
                      style={{ width: `${Math.min((shiftEarnings / Math.max(dailyTarget, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Remittance Summary */}
      <SectionHeader title="Today's Remittance" />
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-gold" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Collected</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-black text-bolt tabular">{formatCurrency(remittanceCollected)}</p>
            <span className="text-xs text-gray-400">/ {formatCurrency(remittanceExpected)}</span>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              remittanceExpected > 0 && remittanceCollected >= remittanceExpected
                ? "bg-linear-to-r from-bolt to-bolt-dark"
                : "bg-linear-to-r from-gold to-gold-dark"
            }`}
            style={{ width: `${remittanceExpected > 0 ? Math.min((remittanceCollected / remittanceExpected) * 100, 100) : 0}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-gray-400">
          <span>{todayRemittances.length} submission{todayRemittances.length !== 1 ? "s" : ""}</span>
          {pendingRemittances > 0 && <span className="text-gold font-bold">{pendingRemittances} pending</span>}
        </div>

        {/* Rider Payables */}
        {totalRiderPayables.riderCount > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-surface-600 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-bolt" />
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Owe Riders Today</p>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">Daily pay ({totalRiderPayables.riderCount} rider{totalRiderPayables.riderCount !== 1 ? "s" : ""} × ₵{riderDailyPay})</span>
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 tabular">{formatCurrency(totalRiderPayables.totalDailyPay)}</span>
            </div>
            {totalRiderPayables.totalBonus > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Bonuses (above ₵{dailyTarget} target)</span>
                <span className="text-xs font-bold text-gold tabular">+{formatCurrency(totalRiderPayables.totalBonus)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-dashed border-gray-200 dark:border-surface-600">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Total Payable</span>
              <span className="text-sm font-black text-bolt tabular">{formatCurrency(totalRiderPayables.total)}</span>
            </div>
            {remittanceCollected > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Net After Payouts</span>
                <span className="text-xs font-black text-gray-900 dark:text-white tabular">{formatCurrency(remittanceCollected - totalRiderPayables.total)}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Proactive Alerts */}
      {alerts.length > 0 && (
        <>
          <SectionHeader title={`Alerts (${alerts.length})`} />
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <Card key={i} padding="sm" className={`border-l-4 ${
                alert.severity === "danger" ? "border-l-danger" :
                alert.severity === "warning" ? "border-l-gold" : "border-l-bolt"
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{alert.icon}</span>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{alert.text}</p>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Fleet Overview */}
      <SectionHeader title="Fleet Overview" />
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
              <Truck className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900 dark:text-white tabular">{fleet}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tricycles</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
              <Users className="h-5 w-5 text-bolt" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900 dark:text-white tabular">{activeRiders}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Active Riders</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Weekly Revenue Chart */}
      <SectionHeader title={`This Week — ${formatCurrency(weekTotal)}`} />
      <Card>
        <div className="h-44" style={{ minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={weekDays} barCategoryGap="20%">
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: "#9CA3AF" }}
              />
              <YAxis hide />
              <Tooltip
                cursor={false}
                contentStyle={{
                  background: "#1F2937",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#fff",
                  padding: "6px 12px",
                }}
                formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
                labelStyle={{ color: "#9CA3AF", fontSize: "10px" }}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={32}>
                {weekDays.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.date === todayISO() ? "#34D399" : entry.revenue > 0 ? "#F5A623" : "#374151"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Break-even Progress */}
      {totalInvestment > 0 && (
        <>
          <SectionHeader title="Break-even Progress" />
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-5 w-5 text-gold" />
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Investment Recovery</p>
                </div>
                <span className={`text-sm font-black tabular ${breakEvenReached ? "text-bolt" : "text-gold"}`}>
                  {Math.round(breakEvenProgress)}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    breakEvenReached
                      ? "bg-linear-to-r from-bolt to-bolt-dark"
                      : "bg-linear-to-r from-gold to-gold-dark"
                  }`}
                  style={{ width: `${breakEvenProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-medium text-gray-400">
                <span className="tabular">{formatCurrency(totalRevenue)} earned</span>
                <span className="tabular">{formatCurrency(totalInvestment)} invested</span>
              </div>
              {breakEvenReached ? (
                <div className="flex items-center gap-2 rounded-xl bg-bolt/10 p-3">
                  <span className="text-lg">🎉</span>
                  <p className="text-xs font-bold text-bolt">Break-even reached! Surplus: {formatCurrency(totalRevenue - totalInvestment)}</p>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-gold/10 p-3">
                  <span className="text-lg">📈</span>
                  <p className="text-xs font-bold text-gold-dark">
                    {formatCurrency(totalInvestment - totalRevenue)} remaining to break even
                  </p>
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Riders quick list */}
      {riderList.length > 0 && (
        <>
          <SectionHeader title={`Riders (${riderList.length})`} />
          <div className="space-y-2">
            {riderList.slice(0, 5).map((rider) => (
              <Card key={rider.id} padding="sm" className="flex items-center justify-between tap-active">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-bolt/20 to-bolt/10 text-sm font-bold text-bolt">
                    {rider.name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{rider.name}</p>
                    <p className="text-[11px] text-gray-500">Bike #{rider.bike}</p>
                  </div>
                </div>
                <StatusBadge status={rider.status || "active"} />
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Live Activity — Active Shifts & Recent Trips */}
      {(activeShifts.length > 0 || todayTripsLive.length > 0) && (
        <>
          <SectionHeader title={`Live Activity (${liveTripsCount} trips)`} />
          {activeShifts.length > 0 && (
            <div className="space-y-2 mb-3">
              {activeShifts.map((shift) => {
                const riderName = Object.values(riders).find(r => r.name && shift.rider_id)?.name || shift.rider_id;
                const shiftTrips = todayTripsLive.filter(t => t.shift_id === shift.id);
                const shiftEarnings = shiftTrips.reduce((s, t) => s + (t.fare_amount || 0), 0);
                const riderObj = Object.entries(riders).find(([id]) => id === shift.rider_id);
                const displayName = riderObj ? riderObj[1].name : shift.rider_id;
                return (
                  <Card key={shift.id} padding="sm" className="border-l-4 border-l-bolt">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
                          <Zap className="h-5 w-5 text-bolt" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{displayName}</p>
                            <span className="flex items-center gap-1 rounded-full bg-bolt/15 px-1.5 py-0.5 text-[9px] font-bold text-bolt">
                              <span className="h-1.5 w-1.5 rounded-full bg-bolt animate-pulse" />
                              ON SHIFT
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500">{shiftTrips.length} trips • {formatCurrency(shiftEarnings)}</p>
                        </div>
                      </div>
                      <p className="text-sm font-black text-bolt tabular">{formatCurrency(shiftEarnings)}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {todayTripsLive.length > 0 && (
            <div className="space-y-1.5">
              {todayTripsLive.slice(-8).reverse().map((trip) => {
                const riderObj = Object.entries(riders).find(([id]) => id === trip.rider_id);
                const displayName = riderObj ? riderObj[1].name : trip.rider_id;
                return (
                  <Card key={trip.id} padding="sm" className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bolt/10">
                        <Navigation className="h-4 w-4 text-bolt" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{displayName}</p>
                        <p className="text-[11px] text-gray-400">{formatTime(trip.trip_time || trip.created_at)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(trip.fare_amount)}</p>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Recent Daily Logs */}
      {recentLogs.length > 0 && (
        <>
          <SectionHeader title="Recent Daily Logs" />
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <Card key={log.id} padding="sm" className="flex items-center justify-between tap-active">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10">
                    <Navigation className="h-4 w-4 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{log.rider}</p>
                    <p className="text-[11px] text-gray-500">{formatDate(log.date)} • {log.trips} trips</p>
                  </div>
                </div>
                <p className="text-sm font-black text-gold tabular">{formatCurrency(log.total_revenue)}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Projections */}
      <SectionHeader title="Projections" />
      <Card>
        <div className="divide-y divide-gray-100 dark:divide-surface-600">
          {[
            { label: "Projected Daily", value: formatCurrency(projectedDaily), icon: Target, color: "text-gold" },
            { label: "Monthly Revenue", value: formatCurrency(projectedDaily * (settings?.wdays || 26)), icon: BarChart3, color: "text-bolt" },
            { label: "Total Payments", value: formatCurrency(totalPayments), icon: Wallet, color: "text-bolt" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-surface-700">
                  <item.icon className={`h-4 w-4 ${item.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-500">{item.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{item.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
