"use client";

import React, { useState, useMemo } from "react";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { EmptyState } from "@/components/ui/loading";
import { formatCurrency, formatDate, todayISO, uid } from "@/lib/utils";
import { SERVICE_TYPES, DEFAULTS } from "@/lib/constants";
import type { Rider, FuelLog, Maintenance } from "@/lib/types";
import { toast } from "sonner";
import {
  Truck, Users, Fuel, Wrench, Plus, UserPlus,
  Phone, Bike, ChevronRight, TrendingDown, MapPin,
  Navigation, Gauge, Clock, Wifi, WifiOff
} from "lucide-react";
import dynamic from "next/dynamic";
import type { RiderLocation } from "@/lib/types";

const RiderMap = dynamic(() => import("@/components/rider-map").then(m => ({ default: m.RiderMap })), { ssr: false });
const RiderLocationList = dynamic(() => import("@/components/rider-map").then(m => ({ default: m.RiderLocationList })), { ssr: false });

type Tab = "riders" | "fuel" | "maintenance" | "live";

export default function FleetPage() {
  const { riders, fuelLogs, maintenance, riderLocations } = useFirebaseStore(useShallow((s) => ({
    riders: s.riders,
    fuelLogs: s.fuelLogs,
    maintenance: s.maintenance,
    riderLocations: s.riderLocations,
  })));
  const [tab, setTab] = useState<Tab>("live");
  const [sheet, setSheet] = useState<"rider" | "fuel" | "maintenance" | null>(null);
  const [editRiderId, setEditRiderId] = useState<string | null>(null);

  const riderList = useMemo(() =>
    Object.entries(riders).map(([id, r]) => ({ ...r, id })), [riders]);
  const activeRiders = riderList.filter((r) => r.status === "active").length;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "live", label: "Live", icon: MapPin },
    { key: "riders", label: "Riders", icon: Users },
    { key: "fuel", label: "Fuel", icon: Fuel },
    { key: "maintenance", label: "Service", icon: Wrench },
  ];

  return (
    <div className="space-y-5 p-4 pb-28 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
          <Truck className="h-5 w-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">Fleet</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage your fleet</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Riders" value={riderList.length} color="bolt" />
        <StatCard label="Active" value={activeRiders} color="gold" />
        <StatCard label="Fuel Logs" value={Object.keys(fuelLogs).length} color="default" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-surface-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-bold transition-all ${
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

      {tab === "live" && (
        <LiveMapTab riderLocations={riderLocations} />
      )}

      {tab === "riders" && (
        <RidersTab
          riderList={riderList}
          onAdd={() => { setEditRiderId(null); setSheet("rider"); }}
          onEdit={(id) => { setEditRiderId(id); setSheet("rider"); }}
        />
      )}

      {tab === "fuel" && (
        <FuelTab
          fuelLogs={fuelLogs}
          onAdd={() => setSheet("fuel")}
        />
      )}

      {tab === "maintenance" && (
        <MaintenanceTab
          maintenance={maintenance}
          onAdd={() => setSheet("maintenance")}
        />
      )}

      {/* Sheets */}
      {sheet === "rider" && (
        <RiderSheet
          editId={editRiderId}
          riders={riders}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "fuel" && (
        <FuelSheet riders={riders} onClose={() => setSheet(null)} />
      )}
      {sheet === "maintenance" && (
        <MaintenanceSheet onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/* ─── Advanced Live Map Tab ─── */
function LiveMapTab({ riderLocations }: { riderLocations: Record<string, RiderLocation> }) {
  const [selectedRider, setSelectedRider] = useState<string | null>(null);

  const entries = Object.entries(riderLocations);
  const totalRiders = entries.length;
  // Separate shift-active riders (phone) from tracker-online devices
  const phoneEntries = entries.filter(([, l]) => l.source !== "tracker");
  const trackerEntries = entries.filter(([, l]) => l.source === "tracker");
  const activeRiders = phoneEntries.filter(([, l]) => l.status === "active").length;
  const trackingDevices = trackerEntries.filter(([, l]) => l.tracker_data?.online).length;
  const idleRiders = totalRiders - activeRiders - trackingDevices;

  // Speed stats — include both on-shift riders AND online trackers
  const liveEntries = entries.filter(([, l]) =>
    l.source === "tracker" ? l.tracker_data?.online : l.status === "active"
  );
  const speeds = liveEntries
    .map(([, l]) => l.source === "tracker" && l.tracker_data?.speed_kmh != null
      ? Math.round(l.tracker_data.speed_kmh)
      : (l.speed != null ? Math.round(l.speed * 3.6) : 0)
    );
  const movingCount = speeds.filter((s) => s > 2).length;
  const parkedCount = liveEntries.length - movingCount;
  const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

  // Stale check (>5 min) — phone riders only (trackers have their own heartbeat)
  const staleCount = phoneEntries.filter(([, l]) => l.status === "active" && (Date.now() - new Date(l.timestamp).getTime() > 5 * 60 * 1000)).length;

  // Tracker vs phone count
  const trackerCount = entries.filter(([, l]) => l.source === "tracker").length;
  const trackerOnline = entries.filter(([, l]) => l.source === "tracker" && l.tracker_data?.online).length;
  const trackerMoving = entries.filter(([, l]) => l.source === "tracker" && l.tracker_data?.movement === "moving").length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-bolt" />
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest dark:text-gray-500">
          Real-Time Fleet Tracking
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {activeRiders > 0 && (
            <Badge variant="green" className="text-[10px]">
              <span className="relative flex h-1.5 w-1.5 mr-1"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" /></span>
              {activeRiders} on shift
            </Badge>
          )}
          {trackingDevices > 0 && (
            <Badge variant="blue" className="text-[10px]">
              <span className="relative flex h-1.5 w-1.5 mr-1"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" /></span>
              {trackingDevices} tracking
            </Badge>
          )}
          {idleRiders > 0 && (
            <Badge variant="default" className="text-[10px]">{idleRiders} offline</Badge>
          )}
          {trackerCount > 0 && (
            <Badge variant="blue" className="text-[10px]">📡 {trackerOnline}/{trackerCount} tracker{trackerCount !== 1 ? "s" : ""}</Badge>
          )}
        </div>
      </div>

      {/* Tracker status card */}
      {trackerCount > 0 && (
        <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/5 border border-indigo-500/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="h-4 w-4 text-indigo-500" />
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">Hardware Trackers</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{trackerOnline}</p>
              <p className="text-[9px] font-bold text-indigo-500/60 uppercase">Online</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{trackerMoving}</p>
              <p className="text-[9px] font-bold text-emerald-500/60 uppercase">Moving</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-gray-500">{trackerCount - trackerOnline}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Offline</p>
            </div>
          </div>
          {entries.filter(([, l]) => l.source === "tracker").map(([id, l]) => {
            const td = l.tracker_data;
            if (!td) return null;
            return (
              <div key={id} className="mt-2 flex items-center gap-2 rounded-lg bg-white/50 dark:bg-surface-700/50 px-3 py-2">
                <div className={`h-2 w-2 rounded-full ${td.online ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex-1">{l.rider_name}</span>
                <span className={`text-[10px] font-bold ${td.speed_kmh > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                  {td.speed_kmh > 0 ? `${td.speed_kmh} km/h` : "Parked"}
                </span>
                {td.heartbeat_age_sec < 120 && (
                  <span className="text-[9px] text-indigo-400">💓 {td.heartbeat_age_sec}s</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Stats (only when riders exist) */}
      {totalRiders > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-center">
            <Gauge className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular">{movingCount}</p>
            <p className="text-[9px] font-bold text-emerald-600/70 uppercase">Moving</p>
          </div>
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-2.5 text-center">
            <Navigation className="h-4 w-4 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-black text-blue-700 dark:text-blue-400 tabular">{parkedCount}</p>
            <p className="text-[9px] font-bold text-blue-600/70 uppercase">Parked</p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-2.5 text-center">
            <WifiOff className="h-4 w-4 text-gray-400 mx-auto mb-1" />
            <p className="text-lg font-black text-gray-600 dark:text-gray-300 tabular">{idleRiders}</p>
            <p className="text-[9px] font-bold text-gray-400 uppercase">Offline</p>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-2.5 text-center">
            <Gauge className="h-4 w-4 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-black text-amber-700 dark:text-amber-400 tabular">{avgSpeed}</p>
            <p className="text-[9px] font-bold text-amber-600/70 uppercase">Avg km/h</p>
          </div>
        </div>
      )}

      {/* Speed alert */}
      {maxSpeed > 40 && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/30 px-3 py-2">
          <span className="text-sm">⚠️</span>
          <p className="text-[11px] font-semibold text-red-700 dark:text-red-400">
            Speed alert: {maxSpeed} km/h detected — check rider safety
          </p>
        </div>
      )}

      {/* Stale signal warning */}
      {staleCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 px-3 py-2">
          <span className="text-sm">📡</span>
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {staleCount} rider{staleCount > 1 ? "s" : ""} with stale GPS ({">"}5 min since last update)
          </p>
        </div>
      )}

      {/* Map */}
      <RiderMap
        locations={riderLocations}
        height="420px"
        selectedRiderId={selectedRider}
        onSelectRider={setSelectedRider}
      />

      {/* Rider list */}
      {totalRiders > 0 && (
        <>
          <SectionHeader title={`Riders (${totalRiders})`} />
          <RiderLocationList
            locations={riderLocations}
            selectedRiderId={selectedRider}
            onSelectRider={setSelectedRider}
          />
        </>
      )}
    </div>
  );
}

/* ─── Riders Tab ─── */
function RidersTab({
  riderList,
  onAdd,
  onEdit,
}: {
  riderList: Array<import("@/lib/types").Keyed<Rider>>;
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  const { editRider, addNotification } = useFirebaseStore(useShallow((s) => ({
    editRider: s.editRider,
    addNotification: s.addNotification,
  })));

  const pendingRiders = riderList.filter((r) => r.selfRegistered && r.registration_status === "pending");
  const otherRiders = riderList.filter((r) => !(r.selfRegistered && r.registration_status === "pending"));

  const handleApprove = async (rider: import("@/lib/types").Keyed<Rider>) => {
    try {
      await editRider(rider.id, { registration_status: "approved" });
      await addNotification({
        type: "rider_added",
        title: "Rider Approved",
        message: `${rider.name} has been approved`,
        icon: "✅",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success(`${rider.name} approved!`);
    } catch {
      toast.error("Failed to approve rider");
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Riders (${riderList.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <UserPlus className="mr-1 h-3.5 w-3.5" /> Add Rider
        </Button>
      </div>

      {/* Pending registrations */}
      {pendingRiders.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gold uppercase tracking-wide">
            Pending Approval ({pendingRiders.length})
          </p>
          {pendingRiders.map((rider) => (
            <Card key={rider.id} padding="sm" className="border-gold/20 bg-gold/5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-sm font-bold text-gold">
                    {rider.name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{rider.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {rider.phone || "No phone"} • Self-registered
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold">
                  Pending
                </span>
              </div>
              {rider.ghana_card_number && (
                <div className="mt-2 rounded-xl bg-surface-700/50 p-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Ghana Card Info</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <p className="text-xs text-gray-400">Card #: <span className="font-mono text-white">{rider.ghana_card_number}</span></p>
                    <p className="text-xs text-gray-400">DOB: <span className="text-white">{rider.date_of_birth || "–"}</span></p>
                    <p className="text-xs text-gray-400">Gender: <span className="text-white capitalize">{rider.gender || "–"}</span></p>
                    <p className="text-xs text-gray-400">Region: <span className="text-white">{rider.region || "–"}</span></p>
                    {rider.hometown && (
                      <p className="text-xs text-gray-400">Hometown: <span className="text-white">{rider.hometown}</span></p>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="bolt" className="flex-1" onClick={() => handleApprove(rider)}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => onEdit(rider.id)}>
                  Review
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {otherRiders.length === 0 && pendingRiders.length === 0 ? (
        <EmptyState title="No riders" message="Add your first rider" />
      ) : (
        <div className="space-y-2">
          {otherRiders.map((rider) => (
            <Card
              key={rider.id}
              padding="sm"
              className="flex items-center justify-between tap-active"
              onClick={() => onEdit(rider.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-bolt/20 to-bolt/10 text-sm font-bold text-bolt">
                  {rider.name?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{rider.name}</p>
                  <p className="text-[11px] text-gray-500">
                    Bike #{rider.bike} • {rider.phone || "No phone"}
                    {rider.ghana_card_number && ` • ${rider.ghana_card_number}`}
                  </p>
                </div>
              </div>
              <StatusBadge status={rider.status || "active"} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Fuel Tab ─── */
function FuelTab({
  fuelLogs,
  onAdd,
}: {
  fuelLogs: Record<string, FuelLog>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(fuelLogs)
    .map(([id, f]) => ({ ...f, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalFuelSpent = sorted.reduce((s, f) => s + (f.cost || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Fuel Logs (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Fuel
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-gold/10 to-gold/5 border border-gold/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
              <Fuel className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Fuel Spent</p>
              <p className="text-xl font-black text-gold tabular">{formatCurrency(totalFuelSpent)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No fuel logs" message="Track fuel purchases" />
      ) : (
        <div className="space-y-2">
          {sorted.map((fuel) => (
            <Card key={fuel.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10">
                  <Fuel className="h-4 w-4 text-gold" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{fuel.notes || "Fuel Log"}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(fuel.date)} • {fuel.litres}L
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-gold tabular">{formatCurrency(fuel.cost)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Maintenance Tab ─── */
function MaintenanceTab({
  maintenance,
  onAdd,
}: {
  maintenance: Record<string, Maintenance>;
  onAdd: () => void;
}) {
  const sorted = Object.entries(maintenance)
    .map(([id, m]) => ({ ...m, id }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalMaint = sorted.reduce((s, m) => s + (m.total_cost || 0), 0);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <SectionHeader title={`Service Records (${sorted.length})`} />
        <Button size="sm" variant="bolt" onClick={onAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Record
        </Button>
      </div>

      {sorted.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10">
              <Wrench className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total Maintenance</p>
              <p className="text-xl font-black text-danger tabular">{formatCurrency(totalMaint)}</p>
            </div>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No service records" message="Log maintenance work" />
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => (
            <Card key={m.id} padding="sm" className="flex items-center justify-between tap-active">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/10">
                  <Wrench className="h-4 w-4 text-danger" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{m.service_type}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(m.date)} • Bike #{m.bike}
                    {m.description && ` • ${m.description}`}
                  </p>
                </div>
              </div>
              <p className="text-sm font-black text-danger tabular">{formatCurrency(m.total_cost)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Rider Sheet ─── */
function RiderSheet({
  editId,
  riders,
  onClose,
}: {
  editId: string | null;
  riders: Record<string, Rider>;
  onClose: () => void;
}) {
  const { addRider, editRider, addNotification } = useFirebaseStore(useShallow((s) => ({
    addRider: s.addRider,
    editRider: s.editRider,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);
  const existing = editId ? riders[editId] : null;

  const [form, setForm] = useState({
    name: existing?.name || "",
    phone: existing?.phone || "",
    bike: existing?.bike ? String(existing.bike) : "",
    status: existing?.status || "active",
  });

  async function handleSave() {
    if (!form.name || !form.bike) {
      toast.error("Name and bike # required");
      return;
    }
    setSaving(true);
    try {
      const data: Partial<Rider> = {
        name: form.name,
        phone: form.phone,
        licence: existing?.licence || "",
        bike: parseInt(form.bike) || 1,
        daily_wage: existing?.daily_wage || 0,
        start_date: existing?.start_date || new Date().toISOString(),
        status: form.status,
      };
      // Preserve Ghana Card fields for self-registered riders
      if (existing?.selfRegistered) {
        data.ghana_card_number = existing.ghana_card_number;
        data.date_of_birth = existing.date_of_birth;
        data.gender = existing.gender;
        data.hometown = existing.hometown;
        data.region = existing.region;
        data.pin = existing.pin;
        data.registered_at = existing.registered_at;
        data.registration_status = existing.registration_status;
        data.selfRegistered = existing.selfRegistered;
      }
      if (editId) {
        await editRider(editId, data);
        toast.success("Rider updated");
      } else {
        await addRider(data as Rider);
        await addNotification({
          type: "rider_added",
          title: "New Rider",
          message: `${form.name} added to fleet`,
          icon: "👤",
          target_role: "management",
          read: false,
          created_at: new Date().toISOString(),
        });
        toast.success("Rider added");
      }
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title={editId ? "Edit Rider" : "Add Rider"}>
      <div className="space-y-4 p-4">
        {/* Ghana Card info display for self-registered riders */}
        {existing?.selfRegistered && existing?.ghana_card_number && (
          <div className="rounded-xl bg-bolt/5 border border-bolt/15 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-bolt uppercase tracking-wide">Ghana Card Registration</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Card #: <span className="font-mono text-gray-900 dark:text-white">{existing.ghana_card_number}</span></p>
              <p className="text-xs text-gray-500 dark:text-gray-400">DOB: <span className="text-gray-900 dark:text-white">{existing.date_of_birth || "–"}</span></p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gender: <span className="text-gray-900 dark:text-white capitalize">{existing.gender || "–"}</span></p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Region: <span className="text-gray-900 dark:text-white">{existing.region || "–"}</span></p>
              {existing.hometown && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Hometown: <span className="text-gray-900 dark:text-white">{existing.hometown}</span></p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">Status: <span className="text-gray-900 dark:text-white capitalize">{existing.registration_status || "–"}</span></p>
            </div>
          </div>
        )}
        <Input
          label="Full Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Rider name"
        />
        <Input
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="0XX XXX XXXX"
        />
        <Input
          label="Bike Number"
          value={form.bike}
          onChange={(e) => setForm({ ...form, bike: e.target.value })}
          placeholder="e.g. 1"
        />
        {editId && (
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        )}
        <Button fullWidth loading={saving} onClick={handleSave}>
          {editId ? "Update Rider" : "Add Rider"}
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Fuel Sheet ─── */
function FuelSheet({
  riders,
  onClose,
}: {
  riders: Record<string, Rider>;
  onClose: () => void;
}) {
  const { addFuelLog, addNotification } = useFirebaseStore(useShallow((s) => ({
    addFuelLog: s.addFuelLog,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const riderList = Object.entries(riders).map(([, r]) => ({
    value: r.name,
    label: r.name,
  }));

  const [form, setForm] = useState({
    rider: riderList[0]?.value || "",
    litres: "",
    cost: "",
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.rider || !form.cost) {
      toast.error("Fill rider and cost");
      return;
    }
    setSaving(true);
    try {
      const log: FuelLog = {
        litres: parseFloat(form.litres) || 0,
        cost: parseFloat(form.cost),
        odometer: 0,
        date: form.date,
        notes: form.rider,
      };
      await addFuelLog(log);
      await addNotification({
        type: "fuel_logged",
        title: "Fuel Logged",
        message: `${form.rider}: ${form.litres}L — ${formatCurrency(log.cost)}`,
        icon: "⛽",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Fuel log added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Fuel Log">
      <div className="space-y-4 p-4">
        <Select
          label="Rider"
          value={form.rider}
          onChange={(e) => setForm({ ...form, rider: e.target.value })}
          options={riderList}
        />
        <Input
          label="Litres"
          type="number"
          value={form.litres}
          onChange={(e) => setForm({ ...form, litres: e.target.value })}
          placeholder="0"
        />
        <Input
          label="Cost (GH₵)"
          type="number"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
          placeholder="0.00"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Fuel Log
        </Button>
      </div>
    </BottomSheet>
  );
}

/* ─── Maintenance Sheet ─── */
function MaintenanceSheet({ onClose }: { onClose: () => void }) {
  const { addMaintenance, addNotification } = useFirebaseStore(useShallow((s) => ({
    addMaintenance: s.addMaintenance,
    addNotification: s.addNotification,
  })));
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    bike: "",
    service_type: SERVICE_TYPES[0] as string,
    cost: "",
    description: "",
    date: todayISO(),
  });

  async function handleSave() {
    if (!form.bike || !form.cost) {
      toast.error("Fill bike and cost");
      return;
    }
    setSaving(true);
    try {
      const record: Maintenance = {
        bike: parseInt(form.bike) || 1,
        service_type: form.service_type,
        description: form.description,
        parts_cost: parseFloat(form.cost) || 0,
        labour_cost: 0,
        total_cost: parseFloat(form.cost) || 0,
        mechanic: "",
        date: form.date,
        notes: "",
      };
      await addMaintenance(record);
      await addNotification({
        type: "maintenance_logged",
        title: "Service Recorded",
        message: `Bike #${form.bike}: ${form.service_type} — ${formatCurrency(record.total_cost)}`,
        icon: "🔧",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });
      toast.success("Service record added");
      onClose();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Add Service Record">
      <div className="space-y-4 p-4">
        <Input
          label="Bike Number"
          value={form.bike}
          onChange={(e) => setForm({ ...form, bike: e.target.value })}
          placeholder="e.g. 1"
        />
        <Select
          label="Service Type"
          value={form.service_type}
          onChange={(e) => setForm({ ...form, service_type: e.target.value })}
          options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
        />
        <Input
          label="Cost (GH₵)"
          type="number"
          value={form.cost}
          onChange={(e) => setForm({ ...form, cost: e.target.value })}
          placeholder="0.00"
        />
        <Input
          label="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Details about the service"
        />
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <Button fullWidth loading={saving} onClick={handleSave}>
          Save Record
        </Button>
      </div>
    </BottomSheet>
  );
}
