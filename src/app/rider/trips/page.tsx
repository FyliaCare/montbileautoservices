"use client";

import React, { useState, useMemo } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useShiftStore } from "@/stores/shift-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency, formatTime, todayISO } from "@/lib/utils";
import { DEFAULTS, INCIDENT_TYPES } from "@/lib/constants";
import { saveNotification } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Navigation, Calendar, TrendingUp, AlertTriangle, Plus,
  MapPin, FileWarning
} from "lucide-react";

type PageTab = "trips" | "incidents";
type Period = "today" | "week" | "all";

export default function RiderTripsPage() {
  const user = useAuthStore((s) => s.user);
  const { todayTrips, todayEarnings, tripCount } = useShiftStore(useShallow((s) => ({
    todayTrips: s.todayTrips,
    todayEarnings: s.todayEarnings,
    tripCount: s.tripCount,
  })));
  const { appTrips, settings, incidents, addIncident } = useFirebaseStore(useShallow((s) => ({
    appTrips: s.appTrips,
    settings: s.settings,
    incidents: s.incidents,
    addIncident: s.addIncident,
  })));
  const [pageTab, setPageTab] = useState<PageTab>("trips");
  const [period, setPeriod] = useState<Period>("today");
  const [showIncidentForm, setShowIncidentForm] = useState(false);

  // Incident form 
  const [incType, setIncType] = useState<string>("breakdown");
  const [incSeverity, setIncSeverity] = useState<string>("medium");
  const [incDesc, setIncDesc] = useState("");
  const [incLocation, setIncLocation] = useState("");

  const fare = settings?.fare || DEFAULTS.fare;

  const allTrips = Object.entries(appTrips)
    .filter(([, t]) => t.rider_id === user?.id)
    .map(([id, t]) => ({ ...t, id }))
    .sort((a, b) => b.trip_time.localeCompare(a.trip_time));

  const today = todayISO();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const filtered = period === "today"
    ? allTrips.filter((t) => t.trip_time.startsWith(today))
    : period === "week"
    ? allTrips.filter((t) => t.trip_time.slice(0, 10) >= weekAgo)
    : allTrips;

  const totalFare = filtered.reduce((s, t) => s + (t.fare_amount || 0), 0);

  const myIncidents = useMemo(() =>
    Object.entries(incidents)
      .filter(([, i]) => user && i.rider_id === user.id)
      .map(([id, i]) => ({ ...i, id }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [incidents, user]
  );

  const handleSubmitIncident = async () => {
    if (!user || !incDesc.trim()) {
      toast.error("Please describe the incident");
      return;
    }
    try {
      await addIncident({
        rider_id: user.id,
        rider_name: user.name,
        tricycle_id: "tricycle-1",
        incident_type: incType as "accident" | "breakdown" | "theft" | "police" | "other",
        severity: incSeverity as "low" | "medium" | "high",
        description: incDesc.trim(),
        location: incLocation.trim() || undefined,
        status: "reported",
        created_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "incident_reported",
        title: "🚨 Incident Report",
        message: `${user.name}: ${incType} (${incSeverity}) - ${incDesc.trim().slice(0, 60)}`,
        icon: "🚨",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success("Incident reported");
      setShowIncidentForm(false);
      setIncDesc("");
      setIncLocation("");
    } catch {
      toast.error("Failed to submit incident");
    }
  };

  const severityColors: Record<string, string> = {
    low: "green",
    medium: "gold",
    high: "red",
  };

  const statusColors: Record<string, string> = {
    reported: "gold",
    investigating: "blue",
    resolved: "green",
  };

  return (
    <div className="space-y-5 p-4 pb-28">
      {/* Page tabs */}
      <div className="flex gap-2 animate-fade-in">
        {([
          { key: "trips" as PageTab, label: "Trips", icon: Navigation },
          { key: "incidents" as PageTab, label: "Incidents", icon: AlertTriangle },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setPageTab(t.key)}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 tap-active ${
              pageTab === t.key
                ? "bg-bolt text-white shadow-md shadow-bolt/20"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-400"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === "trips" ? (
        <>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight animate-fade-in">
            Trip History
          </h1>

          {/* Period tabs */}
          <div className="flex gap-2 animate-fade-in">
            {(["today", "week", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 tap-active ${
                  period === p
                    ? "bg-surface-700 text-white shadow-md"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-surface-700 dark:text-gray-400"
                }`}
              >
                {p === "today" ? "Today" : p === "week" ? "This Week" : "All Time"}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-surface-700 to-surface-800 dark:from-surface-700 dark:to-surface-900 border border-surface-600/50 p-5 animate-slide-up">
            <div className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full bg-bolt/8 blur-[50px]" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Earnings</p>
                <p className="text-3xl font-black text-white tabular mt-1">{formatCurrency(period === "today" ? todayEarnings : totalFare)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Trips</p>
                <p className="text-3xl font-black text-bolt tabular mt-1">{period === "today" ? tripCount : filtered.length}</p>
              </div>
            </div>
          </div>

          {/* Trip List */}
          {filtered.length === 0 ? (
            <EmptyState icon="🛺" title="No trips yet" message={`No trips recorded for ${period === "today" ? "today" : period === "week" ? "this week" : "all time"}`} />
          ) : (
            <div className="space-y-2 animate-fade-in">
              {filtered.slice(0, 50).map((trip) => (
                <Card key={trip.id} padding="sm" className="flex items-center justify-between tap-active">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
                      <Navigation className="h-5 w-5 text-bolt" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white tabular">
                        {formatCurrency(trip.fare_amount)}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(trip.trip_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} &middot; {formatTime(trip.trip_time)}
                      </p>
                    </div>
                  </div>
                  <Badge variant={trip.entry_method === "manual" ? "green" : "blue"} dot>
                    {trip.entry_method}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Incidents Tab */}
          <div className="flex items-center justify-between animate-fade-in">
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Incident Reports
            </h1>
            <Button onClick={() => setShowIncidentForm(true)} variant="bolt" size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}>
              Report
            </Button>
          </div>

          {myIncidents.length === 0 ? (
            <EmptyState icon="✅" title="No incidents" message="All clear! No incidents to report." />
          ) : (
            <div className="space-y-2 animate-fade-in">
              {myIncidents.map((inc) => (
                <Card key={inc.id} padding="sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        inc.severity === "high" ? "bg-danger/10" : inc.severity === "medium" ? "bg-gold/10" : "bg-bolt/10"
                      }`}>
                        <AlertTriangle className={`h-5 w-5 ${
                          inc.severity === "high" ? "text-danger" : inc.severity === "medium" ? "text-gold" : "text-bolt"
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{inc.incident_type}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{inc.description}</p>
                        {inc.location && (
                          <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-2.5 w-2.5" />{inc.location}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(inc.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={severityColors[inc.severity] as "green" | "gold" | "red"}>
                        {inc.severity}
                      </Badge>
                      <Badge variant={statusColors[inc.status] as "green" | "gold" | "blue"}>
                        {inc.status}
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Incident Report Form */}
      <BottomSheet open={showIncidentForm} onClose={() => setShowIncidentForm(false)} title="Report Incident">
        <div className="space-y-4 p-1">
          <Select label="Incident Type" value={incType} onChange={(e) => setIncType(e.target.value)}
            options={INCIDENT_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          <Select label="Severity" value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)}
            options={[
              { value: "low", label: "🟢 Low" },
              { value: "medium", label: "🟡 Medium" },
              { value: "high", label: "🔴 High" },
            ]} />
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Description</label>
            <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)}
              rows={3} placeholder="What happened?"
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-bolt resize-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">Location (optional)</label>
            <input value={incLocation} onChange={(e) => setIncLocation(e.target.value)}
              placeholder="Where did it happen?"
              className="w-full rounded-xl border border-gray-200 bg-surface-50 dark:bg-surface-700 dark:border-surface-600 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-bolt" />
          </div>
          <Button onClick={handleSubmitIncident} variant="danger" size="lg" fullWidth
            icon={<AlertTriangle className="h-5 w-5" />}>
            Submit Report
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
