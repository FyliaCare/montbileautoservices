"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useShiftStore } from "@/stores/shift-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { saveNotification } from "@/lib/firebase";
import { Card, StatCard, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { formatCurrency, formatDuration, formatTime, todayISO, uid } from "@/lib/utils";
import { DEFAULTS, SHIFT_START_HOUR, SHIFT_END_HOUR } from "@/lib/constants";
import { toast } from "sonner";
import { Play, Square, Plus, Navigation, Clock, Target, TrendingUp, Zap, MapPin, Fuel, CheckCircle2, XCircle, ClipboardCheck, Mic, MicOff, Wallet, AlertTriangle, BookOpen } from "lucide-react";
import { startLocationTracking, stopLocationTracking, clearLocationFromMap, checkAtBase } from "@/lib/location";
import { useRouter } from "next/navigation";

export default function RiderDashboard() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const {
    currentShiftId, clockInTime, isShiftActive, isOnline, todayTrips, todayEarnings, tripCount,
    overtimeStartedAt,
    startShift, endShift, addTrip, loadTodayData, goOnline, goOffline, markOvertime,
  } = useShiftStore(useShallow((s) => ({
    currentShiftId: s.currentShiftId,
    clockInTime: s.clockInTime,
    isShiftActive: s.isShiftActive,
    isOnline: s.isOnline,
    todayTrips: s.todayTrips,
    todayEarnings: s.todayEarnings,
    tripCount: s.tripCount,
    overtimeStartedAt: s.overtimeStartedAt,
    startShift: s.startShift,
    endShift: s.endShift,
    addTrip: s.addTrip,
    loadTodayData: s.loadTodayData,
    goOnline: s.goOnline,
    goOffline: s.goOffline,
    markOvertime: s.markOvertime,
  })));
  const { addDailyLog, settings, addShift: fbAddShift, editShift: fbEditShift, addTrip: fbAddTrip, addFuelLog } =
    useFirebaseStore(useShallow((s) => ({
      addDailyLog: s.addDailyLog,
      settings: s.settings,
      addShift: s.addShift,
      editShift: s.editShift,
      addTrip: s.addTrip,
      addFuelLog: s.addFuelLog,
    })));

  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showFuelLog, setShowFuelLog] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<{ trips: number; earnings: number; duration: string; overtimeDur: string } | null>(null);
  const [fareAmount, setFareAmount] = useState("");
  const [fuelCost, setFuelCost] = useState("");
  const [fuelLitres, setFuelLitres] = useState("");
  const [shiftLoading, setShiftLoading] = useState(false);
  const [duration, setDuration] = useState("0:00:00");
  const [isListening, setIsListening] = useState(false);
  const [showCoinAnim, setShowCoinAnim] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [checklist, setChecklist] = useState({
    engine: false, brakes: false, lights_horn: false, tires: false, fuel_level: false,
  });

  const fare = settings?.fare || DEFAULTS.fare;
  const pax = settings?.pax || DEFAULTS.pax;
  const dailyTarget = settings?.remit_d || DEFAULTS.dailyTarget;
  const riderDailyPay = settings?.rider_daily_pay || DEFAULTS.riderDailyPay;
  const progress = dailyTarget > 0 ? Math.min((todayEarnings / dailyTarget) * 100, 100) : 0;
  const todayBonus = Math.max(0, todayEarnings - dailyTarget);
  const todayRiderTotal = riderDailyPay + todayBonus;

  useEffect(() => {
    if (!fareAmount) setFareAmount(String(fare));
  }, [fare, fareAmount]);

  const setRider = useShiftStore((s) => s.setRider);

  useEffect(() => {
    if (user?.id) {
      setRider(user.id);
      loadTodayData(user.id);
    }
  }, [user?.id, loadTodayData]);

  useEffect(() => {
    if (!isShiftActive || !clockInTime) return;
    const interval = setInterval(() => {
      setDuration(formatDuration(Date.now() - new Date(clockInTime).getTime()));
    }, 1000);
    return () => clearInterval(interval);
  }, [isShiftActive, clockInTime]);

  // ── Overtime detection ──
  const [overtimeDuration, setOvertimeDuration] = useState("0:00:00");
  const [showOvertimePrompt, setShowOvertimePrompt] = useState(false);

  useEffect(() => {
    if (!isShiftActive) return;

    const check = () => {
      const now = new Date();
      const hour = now.getHours();
      if (hour >= SHIFT_END_HOUR && !overtimeStartedAt) {
        // Just crossed 7 PM — trigger overtime
        markOvertime();
        setShowOvertimePrompt(true);
        toast.warning("⏰ It's past 7 PM — you're now in extra time!");
      }
      // Update overtime duration display
      if (overtimeStartedAt) {
        setOvertimeDuration(formatDuration(Date.now() - new Date(overtimeStartedAt).getTime()));
      }
    };

    check(); // run once immediately
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isShiftActive, overtimeStartedAt, markOvertime]);

  const handleStartShift = () => {
    if (!user) return;
    // Block shift start before 6 AM
    const currentHour = new Date().getHours();
    if (currentHour < SHIFT_START_HOUR) {
      toast.error(`Shifts can only start from ${SHIFT_START_HOUR}:00 AM. Come back at 6 AM!`);
      return;
    }
    // Show checklist first — shift starts after checklist completion
    setChecklist({ engine: false, brakes: false, lights_horn: false, tires: false, fuel_level: false });
    setShowChecklist(true);
  };

  const checklistItems = [
    { key: "engine" as const, label: "Engine starts properly", icon: "🔧" },
    { key: "brakes" as const, label: "Brakes working", icon: "🛑" },
    { key: "lights_horn" as const, label: "Lights & horn working", icon: "💡" },
    { key: "tires" as const, label: "Tires in good shape", icon: "🛞" },
    { key: "fuel_level" as const, label: "Enough fuel", icon: "⛽" },
  ];

  const allChecked = Object.values(checklist).every(Boolean);

  const handleConfirmChecklist = async () => {
    if (!user) return;
    setShowChecklist(false);
    setShiftLoading(true);

    // ── Geofence check — must be at base station ──
    try {
      const { atBase, distanceM } = await checkAtBase();
      if (!atBase) {
        toast.error(`You must be at the base station to start your shift. You are ${Math.round(distanceM)}m away.`);
        setShiftLoading(false);
        return;
      }
    } catch {
      toast.error("Cannot verify your location. Please enable GPS and try again.");
      setShiftLoading(false);
      return;
    }

    const allPassed = Object.values(checklist).every(Boolean);
    try {
      const shiftId = startShift(user.id, "tricycle-1");
      await fbAddShift(shiftId, {
        rider_id: user.id,
        tricycle_id: "tricycle-1",
        clock_in_time: new Date().toISOString(),
        status: "active",
        total_trips: 0,
        total_earnings: 0,
        total_expenses: 0,
        checklist: { ...checklist, completed_at: new Date().toISOString(), all_passed: allPassed },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await saveNotification({
        type: "shift_started",
        title: "Shift Started",
        message: `${user.name} started a new shift`,
        icon: "🟢",
        target_role: "all",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});

      if (!allPassed) {
        const failed = checklistItems.filter((i) => !checklist[i.key]).map((i) => i.label);
        await saveNotification({
          type: "checklist_failed",
          title: "⚠️ Vehicle Issue Reported",
          message: `${user.name} flagged: ${failed.join(", ")}`,
          icon: "⚠️",
          target_role: "management",
          actor: user.name,
          read: false,
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }

      const trackingStarted = startLocationTracking(user.id, user.name, shiftId);
      if (trackingStarted) {
        toast.success("Shift started! 📍 Location tracking active");
      } else {
        toast.success("Shift started! (Location unavailable)");
      }
    } catch (e) {
      toast.error("Failed to start shift");
    }
    setShiftLoading(false);
  };

  // Online/Offline toggle handler
  const handleToggleOnline = async () => {
    if (!user || !isShiftActive) return;
    if (isOnline) {
      // Going offline
      goOffline();
      stopLocationTracking();
      toast.info("You're offline — GPS paused");
      await saveNotification({
        type: "rider_offline",
        title: "Rider Went Offline",
        message: `${user.name} went offline`,
        icon: "⚫",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    } else {
      // Going online
      goOnline();
      startLocationTracking(user.id, user.name, currentShiftId || "");
      toast.success("You're online — GPS tracking active 📍");
      await saveNotification({
        type: "rider_online",
        title: "Rider Went Online",
        message: `${user.name} went online`,
        icon: "🟢",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }
  };

  const handleEndShift = async () => {
    if (!user) return;
    setShiftLoading(true);

    // ── Geofence check — must be at base station ──
    try {
      const { atBase, distanceM } = await checkAtBase();
      if (!atBase) {
        toast.error(`You must be at the base station to end your shift. You are ${Math.round(distanceM)}m away.`);
        setShiftLoading(false);
        return;
      }
    } catch {
      toast.error("Cannot verify your location. Please enable GPS and try again.");
      setShiftLoading(false);
      return;
    }

    // Fully remove from map + go offline
    goOffline();
    clearLocationFromMap();
    try {
      // Capture overtime duration string before endShift() clears it
      const otDur = overtimeStartedAt
        ? formatDuration(Date.now() - new Date(overtimeStartedAt).getTime())
        : "0:00:00";
      const result = endShift();
      if (result) {
        await fbEditShift(result.shiftId, {
          clock_out_time: new Date().toISOString(),
          status: "completed",
          total_trips: result.trips,
          total_earnings: result.earnings,
          overtime_ms: result.overtimeMs,
          updated_at: new Date().toISOString(),
        });
        await addDailyLog({
          date: todayISO(),
          bike: 1,
          rider: user.name,
          trips: result.trips,
          passengers: result.trips * pax,
          fare,
          fare_revenue: result.earnings,
          extra_income: 0,
          total_revenue: result.earnings,
          fuel_cost: 0,
          notes: `Auto-logged from shift ${result.shiftId}`,
        });
        await saveNotification({
          type: "shift_ended",
          title: "Shift Ended",
          message: `${user.name} ended shift — ${result.trips} trips, ${formatCurrency(result.earnings)}`,
          icon: "🔴",
          target_role: "all",
          actor: user.name,
          read: false,
          created_at: new Date().toISOString(),
        }).catch(() => {});
        setShiftSummary({ trips: result.trips, earnings: result.earnings, duration, overtimeDur: otDur });
        setShowSummary(true);
      }
    } catch (e) {
      toast.error("Failed to end shift");
    }
    setShiftLoading(false);
  };

  const handleAddTrip = async () => {
    if (!user) return;
    const amount = parseFloat(fareAmount) || fare;
    const { tripId, shiftId } = addTrip(amount);

    try {
      await fbAddTrip(tripId, {
        shift_id: shiftId,
        rider_id: user.id,
        tricycle_id: "tricycle-1",
        fare_amount: amount,
        trip_time: new Date().toISOString(),
        entry_method: "manual",
        created_at: new Date().toISOString(),
      });

      const newEarnings = todayEarnings + amount;
      if (newEarnings >= dailyTarget && todayEarnings < dailyTarget) {
        await saveNotification({
          type: "daily_target_reached",
          title: "Daily Target Reached! 🎯",
          message: `${user.name} hit the GH₵${dailyTarget} daily target!`,
          icon: "🎯",
          target_role: "all",
          actor: user.name,
          read: false,
          created_at: new Date().toISOString(),
        }).catch(() => {});
        toast.success("🎯 Daily target reached!");
      }
    } catch {}

    setShowAddTrip(false);
    setFareAmount(String(fare));
    toast.success(`Trip logged: ${formatCurrency(amount)}`);
    // Coin animation
    setShowCoinAnim(true);
    setTimeout(() => setShowCoinAnim(false), 1500);
  };

  // Voice command handler
  const handleVoiceCommand = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Voice not supported on this browser");
      return;
    }
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const recognition = new (SpeechRecognition as new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: (event: { results: { transcript: string }[][] }) => void;
      onerror: () => void;
      onend: () => void;
    })();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setIsListening(false);

      if (transcript.includes("trip") || transcript.includes("log") || transcript.includes("ride")) {
        // Extract number if spoken
        const numMatch = transcript.match(/(\d+)/);
        const amount = numMatch ? parseFloat(numMatch[1]) : fare;
        setFareAmount(String(amount));
        setShowAddTrip(true);
        toast.info(`🎤 Heard: "${transcript}" — logging trip`);
      } else if (transcript.includes("fuel") || transcript.includes("gas")) {
        setShowFuelLog(true);
        toast.info(`🎤 Heard: "${transcript}" — fuel log`);
      } else if (transcript.includes("start") || transcript.includes("clock in")) {
        if (!isShiftActive) {
          handleStartShift();
          toast.info(`🎤 Starting shift`);
        }
      } else if (transcript.includes("stop") || transcript.includes("end") || transcript.includes("clock out")) {
        if (isShiftActive) {
          handleEndShift();
          toast.info(`🎤 Ending shift`);
        }
      } else {
        toast.info(`🎤 "${transcript}" — say "log trip", "fuel", "start", or "end"`);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Voice recognition failed");
    };

    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleLogFuel = async () => {
    if (!user) return;
    const cost = parseFloat(fuelCost) || 0;
    const litres = parseFloat(fuelLitres) || 0;
    if (cost <= 0) { toast.error("Enter fuel cost"); return; }
    try {
      await addFuelLog({
        date: todayISO(),
        litres,
        cost,
        odometer: 0,
        notes: `Logged by ${user.name} during shift`,
      });
      await saveNotification({
        type: "fuel_logged",
        title: "Fuel Purchase",
        message: `${user.name} bought fuel — ${formatCurrency(cost)}`,
        icon: "⛽",
        target_role: "management",
        actor: user.name,
        read: false,
        created_at: new Date().toISOString(),
      }).catch(() => {});
      toast.success(`Fuel logged: ${formatCurrency(cost)}`);
    } catch {
      toast.error("Failed to log fuel");
    }
    setShowFuelLog(false);
    setFuelCost("");
    setFuelLitres("");
  };

  return (
    <div className="space-y-5 p-4 pb-28">
      {/* ─── Greeting ─── */}
      <div className="animate-fade-in">
        <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {isShiftActive ? "Shift Active" : `Hey, ${user?.name?.split(" ")[0] || "Rider"} 👋`}
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* ─── Shift Control Hero ─── */}
      <div className="animate-slide-up">
        {isShiftActive ? (
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-surface-700 to-surface-800 dark:from-surface-700 dark:to-surface-900 border border-surface-600/50 p-5">
            {/* Background glow */}
            <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-bolt/8 blur-[60px]" />

            <div className="relative">
              {/* Status + Duration */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-bolt animate-pulse-soft" />
                    <span className="text-xs font-bold text-bolt uppercase tracking-wider">Live Shift</span>
                    {overtimeStartedAt && (
                      <span className="ml-1 rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-black text-danger uppercase tracking-wider animate-pulse">
                        Extra Time
                      </span>
                    )}
                  </div>
                  <p className="text-4xl font-black text-white tabular tracking-tight">{duration}</p>
                  {overtimeStartedAt && (
                    <p className="mt-1 text-sm font-bold text-danger tabular">
                      ⏰ Overtime: {overtimeDuration}
                    </p>
                  )}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bolt/10">
                  <Clock className="h-6 w-6 text-bolt" strokeWidth={1.8} />
                </div>
              </div>

              {/* Online/Offline Toggle */}
              <button
                onClick={handleToggleOnline}
                className="mb-4 flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 transition-all tap-active hover:bg-white/10"
              >
                <div className="flex items-center gap-3">
                  <MapPin className={`h-4 w-4 ${isOnline ? "text-green-400" : "text-gray-500"}`} strokeWidth={2} />
                  <span className={`text-sm font-bold ${isOnline ? "text-green-400" : "text-gray-400"}`}>
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>
                {/* Toggle switch */}
                <div className={`relative h-7 w-12 rounded-full transition-colors duration-300 ${isOnline ? "bg-green-500" : "bg-gray-600"}`}>
                  <div className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${isOnline ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => setShowAddTrip(true)}
                  variant="bolt"
                  size="lg"
                  className="w-full"
                  icon={<Plus className="h-5 w-5" strokeWidth={2.5} />}
                >
                  Trip
                </Button>
                <Button
                  onClick={() => setShowFuelLog(true)}
                  variant="gold"
                  size="lg"
                  className="w-full"
                  icon={<Fuel className="h-4 w-4" strokeWidth={2} />}
                >
                  Fuel
                </Button>
                <Button
                  onClick={() => setShowEndConfirm(true)}
                  loading={shiftLoading}
                  variant="danger"
                  size="lg"
                  className="w-full"
                  icon={<Square className="h-4 w-4" strokeWidth={2.5} />}
                >
                  End
                </Button>
              </div>

              {/* Voice command button */}
              <button
                onClick={handleVoiceCommand}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold transition-all tap-active ${
                  isListening
                    ? "bg-danger/20 text-danger animate-pulse"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {isListening ? "Listening..." : "Voice Command"}
              </button>
            </div>

            {/* Coin animation overlay */}
            {showCoinAnim && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="animate-bounce text-4xl">🪙</div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-bolt/5 to-bolt/10 dark:from-bolt/8 dark:to-bolt/3 border border-bolt/15 p-6">
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-bolt/10 blur-[60px]" />
            <div className="relative flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bolt/10">
                <Zap className="h-8 w-8 text-bolt" strokeWidth={1.8} />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Ready to ride?</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-5">Start your shift to begin logging trips</p>
              <Button
                onClick={handleStartShift}
                loading={shiftLoading}
                variant="bolt"
                size="lg"
                className="w-full max-w-xs"
                icon={<Play className="h-5 w-5" fill="currentColor" strokeWidth={0} />}
              >
                Start Shift
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Daily Stats ─── */}
      <div className="grid grid-cols-2 gap-3 animate-fade-in">
        <StatCard
          label="Earnings"
          value={formatCurrency(todayEarnings)}
          color="gold"
          icon={<TrendingUp className="h-4 w-4" strokeWidth={2} />}
        />
        <StatCard
          label="Trips"
          value={tripCount}
          color="bolt"
          icon={<Navigation className="h-4 w-4" strokeWidth={2} />}
        />
      </div>

      {/* ─── Daily Target Progress ─── */}
      <Card className="animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-bolt" strokeWidth={2} />
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Daily Target</p>
          </div>
          <span className={`text-sm font-extrabold tabular ${progress >= 100 ? "text-bolt" : "text-gold"}`}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-surface-600 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              progress >= 100
                ? "bg-linear-to-r from-bolt to-bolt-dark"
                : "bg-linear-to-r from-gold to-gold-dark"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2.5 flex justify-between text-xs text-gray-400">
          <span className="tabular">{formatCurrency(todayEarnings)}</span>
          <span className="tabular">{formatCurrency(dailyTarget)}</span>
        </div>
      </Card>

      {/* ─── Management Owes You ─── */}
      <Card className="animate-fade-in">
        <SectionHeader title="Management Owes You" />
        <div className="mt-2 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bolt/10">
                <Wallet className="h-4 w-4 text-bolt" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Daily Pay</span>
                <p className="text-[10px] text-gray-400">Paid to you physically</p>
              </div>
            </div>
            <span className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(riderDailyPay)}</span>
          </div>
          {todayBonus > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10">
                  <TrendingUp className="h-4 w-4 text-gold" />
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bonus</span>
                  <p className="text-[10px] text-gray-400">Sent to your account</p>
                </div>
              </div>
              <span className="text-sm font-bold text-gold tabular">+{formatCurrency(todayBonus)}</span>
            </div>
          )}
          <div className="border-t border-gray-100 dark:border-surface-600 pt-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total Owed</span>
            <span className="text-lg font-black text-bolt tabular">{formatCurrency(todayRiderTotal)}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-bolt/10 p-3">
          <span className="text-sm">💡</span>
          <p className="text-[11px] font-semibold text-bolt">Submit all earnings — you&apos;ll be paid ₵{riderDailyPay}{todayBonus > 0 ? ` + ₵${todayBonus} bonus` : ""}</p>
        </div>
        {todayBonus > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-gold/10 p-3">
            <span className="text-lg">🎉</span>
            <p className="text-xs font-bold text-gold-dark">You earned {formatCurrency(todayBonus)} bonus above target!</p>
          </div>
        )}
      </Card>

      {/* ─── Recent Trips ─── */}
      {todayTrips.length > 0 && (
        <div className="animate-fade-in">
          <SectionHeader title="Today's Trips" />
          <div className="space-y-2">
            {todayTrips.slice(-5).reverse().map((trip, i) => (
              <Card
                key={trip.id}
                padding="sm"
                className="flex items-center justify-between tap-active"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10">
                    <Navigation className="h-5 w-5 text-bolt" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular">{formatCurrency(trip.fare)}</p>
                    <p className="text-[11px] text-gray-400">{formatTime(trip.time)}</p>
                  </div>
                </div>
                <Badge variant="green" dot>Logged</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Training Centre Link ─── */}
      <button
        onClick={() => router.push("/rider/training")}
        className="w-full animate-fade-in"
      >
        <Card className="flex items-center gap-3 tap-active hover:bg-gray-50 dark:hover:bg-surface-750 transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bolt/10 shrink-0">
            <BookOpen className="h-5 w-5 text-bolt" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Training Centre</p>
            <p className="text-[10px] text-gray-400">Learn how to use the platform — shifts, trips, voice commands & more</p>
          </div>
          <div className="text-gray-400">›</div>
        </Card>
      </button>

      {/* ─── Add Trip Sheet ─── */}
      <BottomSheet open={showAddTrip} onClose={() => setShowAddTrip(false)} title="Log Trip">
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Fare Amount (GH₵)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={fareAmount}
              onChange={(e) => setFareAmount(e.target.value)}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 text-3xl font-black text-center text-gray-900 tabular
                focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none focus:bg-white
                dark:border-surface-600 dark:bg-surface-700 dark:text-white dark:focus:border-bolt dark:focus:bg-surface-700"
            />
          </div>

          {/* Quick amounts */}
          <div className="flex gap-2 flex-wrap">
            {[3, 5, 7, 10, 20].map((amt) => (
              <button
                key={amt}
                onClick={() => setFareAmount(String(amt))}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 tap-active ${
                  parseFloat(fareAmount) === amt
                    ? "bg-bolt/15 text-bolt border border-bolt/20"
                    : "bg-gray-100 text-gray-600 hover:bg-bolt/5 hover:text-bolt dark:bg-surface-600 dark:text-gray-300"
                }`}
              >
                GH₵{amt}
              </button>
            ))}
            <button
              onClick={() => {
                setFareAmount("");
                const inp = document.querySelector<HTMLInputElement>('input[type="number"]');
                inp?.focus();
              }}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 tap-active ${
                fareAmount && ![3, 5, 7, 10, 20].includes(parseFloat(fareAmount))
                  ? "bg-gold/15 text-gold border border-gold/20"
                  : "bg-gray-100 text-gray-600 hover:bg-gold/5 hover:text-gold dark:bg-surface-600 dark:text-gray-300"
              }`}
            >
              Custom
            </button>
          </div>

          <Button onClick={handleAddTrip} variant="bolt" size="lg" fullWidth>
            Confirm Trip — {formatCurrency(parseFloat(fareAmount) || fare)}
          </Button>
        </div>
      </BottomSheet>

      {/* ─── Vehicle Checklist Sheet ─── */}
      <BottomSheet open={showChecklist} onClose={() => setShowChecklist(false)} title="Vehicle Inspection">
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Check each item before starting your shift:</p>
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setChecklist((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 transition-all tap-active ${
                  checklist[item.key]
                    ? "border-bolt/30 bg-bolt/5"
                    : "border-gray-200 bg-gray-50 dark:border-surface-600 dark:bg-surface-700"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="flex-1 text-left text-sm font-semibold text-gray-900 dark:text-white">{item.label}</span>
                {checklist[item.key] ? (
                  <CheckCircle2 className="h-6 w-6 text-bolt" />
                ) : (
                  <XCircle className="h-6 w-6 text-gray-300 dark:text-surface-500" />
                )}
              </button>
            ))}
          </div>
          <Button onClick={handleConfirmChecklist} variant="bolt" size="lg" fullWidth loading={shiftLoading}
            icon={<ClipboardCheck className="h-5 w-5" />}>
            {allChecked ? "All Good — Start Shift" : "Start Shift (Issues Flagged)"}
          </Button>
        </div>
      </BottomSheet>

      {/* ─── Fuel Log Sheet ─── */}
      <BottomSheet open={showFuelLog} onClose={() => setShowFuelLog(false)} title="Log Fuel Purchase">
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Cost (GH₵)
            </label>
            <input type="number" inputMode="decimal" value={fuelCost} onChange={(e) => setFuelCost(e.target.value)}
              placeholder="e.g. 25"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 text-2xl font-black text-center text-gray-900 tabular
                focus:border-gold focus:ring-2 focus:ring-gold/20 focus:outline-none focus:bg-white
                dark:border-surface-600 dark:bg-surface-700 dark:text-white dark:focus:border-gold" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Litres (optional)
            </label>
            <input type="number" inputMode="decimal" value={fuelLitres} onChange={(e) => setFuelLitres(e.target.value)}
              placeholder="e.g. 3.5"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-lg font-bold text-center text-gray-900 tabular
                focus:border-gold focus:ring-2 focus:ring-gold/20 focus:outline-none focus:bg-white
                dark:border-surface-600 dark:bg-surface-700 dark:text-white dark:focus:border-gold" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[10, 15, 20, 25, 30, 50].map((amt) => (
              <button key={amt} onClick={() => setFuelCost(String(amt))}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-all tap-active ${
                  parseFloat(fuelCost) === amt
                    ? "bg-gold/15 text-gold border border-gold/20"
                    : "bg-gray-100 text-gray-600 hover:bg-gold/5 hover:text-gold dark:bg-surface-600 dark:text-gray-300"
                }`}>
                GH₵{amt}
              </button>
            ))}
          </div>
          <Button onClick={handleLogFuel} variant="gold" size="lg" fullWidth
            icon={<Fuel className="h-5 w-5" />}>
            Log Fuel — {formatCurrency(parseFloat(fuelCost) || 0)}
          </Button>
        </div>
      </BottomSheet>

      {/* ─── End Shift Confirmation ─── */}
      <BottomSheet open={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Shift?">
        <div className="space-y-5 p-1">
          <div className="flex items-center gap-3 rounded-2xl bg-danger/10 p-4">
            <AlertTriangle className="h-6 w-6 text-danger shrink-0" />
            <div>
              <p className="text-sm font-bold text-danger">Are you sure?</p>
              <p className="text-xs text-danger/70 mt-0.5">You can only start one shift per day. Once ended, you cannot restart.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
              <p className="text-xl font-black text-bolt tabular">{tripCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Trips</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
              <p className="text-xl font-black text-gold tabular">{formatCurrency(todayEarnings)}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Earned</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
              <p className="text-xl font-black text-gray-900 dark:text-white">{duration}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Duration</p>
            </div>
          </div>

          {overtimeStartedAt && (
            <div className="flex items-center gap-2 rounded-xl bg-danger/10 p-3">
              <span className="text-lg">⏰</span>
              <div>
                <p className="text-xs font-bold text-danger">Extra Time: {overtimeDuration}</p>
                <p className="text-[10px] text-danger/70">You've been working past the 7 PM shift end</p>
              </div>
            </div>
          )}

          {todayEarnings < dailyTarget && (
            <div className="flex items-center gap-2 rounded-xl bg-gold/10 p-3">
              <span className="text-lg">⚠️</span>
              <p className="text-xs font-bold text-gold-dark">
                You haven't hit your daily target yet! {formatCurrency(dailyTarget - todayEarnings)} more to go.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl bg-surface-50 dark:bg-surface-700 p-3">
            <span className="text-sm">💡</span>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              After ending, submit all {formatCurrency(todayEarnings)} to management. They'll pay you back ₵{riderDailyPay}{todayBonus > 0 ? ` + ₵${todayBonus} bonus` : ""}.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setShowEndConfirm(false)} variant="secondary" size="lg" className="flex-1">
              Keep Riding
            </Button>
            <Button
              onClick={() => { setShowEndConfirm(false); handleEndShift(); }}
              variant="danger"
              size="lg"
              className="flex-1"
              loading={shiftLoading}
              icon={<Square className="h-4 w-4" />}
            >
              End Shift
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Shift End Summary */}
      <BottomSheet open={showSummary} onClose={() => setShowSummary(false)} title="Shift Complete! 🎉">
        {shiftSummary && (
          <div className="space-y-5 p-1">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-bolt/10 mb-3">
                <CheckCircle2 className="h-8 w-8 text-bolt" />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Great work today!</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
                <p className="text-2xl font-black text-bolt tabular">{shiftSummary.trips}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Trips</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
                <p className="text-2xl font-black text-gold tabular">{formatCurrency(shiftSummary.earnings)}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Earned</p>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
                <p className="text-2xl font-black text-gray-900 dark:text-white">{shiftSummary.duration}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Duration</p>
              </div>
            </div>

            {shiftSummary.overtimeDur !== "0:00:00" && (
              <div className="flex items-center gap-2 rounded-xl bg-danger/10 p-3">
                <span className="text-lg">⏰</span>
                <div>
                  <p className="text-xs font-bold text-danger">Extra Time: {shiftSummary.overtimeDur}</p>
                  <p className="text-[10px] text-danger/70">Time worked past the 7 PM shift end</p>
                </div>
              </div>
            )}

            {shiftSummary.earnings >= dailyTarget ? (
              <div className="flex items-center gap-2 rounded-xl bg-bolt/10 p-3">
                <span className="text-lg">🎯</span>
                <div>
                  <p className="text-xs font-bold text-bolt">Daily target reached!</p>
                  <p className="text-[11px] text-bolt/70">
                    Management owes you: {formatCurrency(riderDailyPay)} + {formatCurrency(shiftSummary.earnings - dailyTarget)} bonus
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-gold/10 p-3">
                <span className="text-lg">💪</span>
                <div>
                  <p className="text-xs font-bold text-gold-dark">
                    {formatCurrency(dailyTarget - shiftSummary.earnings)} short of target
                  </p>
                  <p className="text-[11px] text-gold-dark/70">
                    Management owes you: {formatCurrency(riderDailyPay)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl bg-surface-50 dark:bg-surface-700 p-3">
              <span className="text-sm">💡</span>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                Submit all {formatCurrency(shiftSummary.earnings)} to management — they&apos;ll pay you back
              </p>
            </div>

            {shiftSummary.trips > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-surface-700 p-3">
                <span className="text-xs font-semibold text-gray-500">Avg per trip</span>
                <span className="text-sm font-black text-gray-900 dark:text-white tabular">
                  {formatCurrency(shiftSummary.earnings / shiftSummary.trips)}
                </span>
              </div>
            )}

            <Button onClick={() => setShowSummary(false)} variant="bolt" size="lg" fullWidth>
              Done
            </Button>
          </div>
        )}
      </BottomSheet>

      {/* ─── Overtime Prompt ─── */}
      <BottomSheet open={showOvertimePrompt} onClose={() => setShowOvertimePrompt(false)} title="⏰ Extra Time!">
        <div className="space-y-5 p-1">
          <div className="flex items-center gap-3 rounded-2xl bg-danger/10 p-4">
            <span className="text-3xl">⏰</span>
            <div>
              <p className="text-sm font-bold text-danger">You&apos;re now in extra time</p>
              <p className="text-xs text-danger/70 mt-0.5">
                Your regular shift ended at 7:00 PM. Any time from now is tracked separately as overtime.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
              <p className="text-xl font-black text-bolt tabular">{duration}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Total Shift</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-surface-700 p-3 text-center">
              <p className="text-xl font-black text-danger tabular">{overtimeDuration}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-1">Extra Time</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setShowOvertimePrompt(false)} variant="secondary" size="lg" className="flex-1">
              Keep Riding
            </Button>
            <Button
              onClick={() => { setShowOvertimePrompt(false); setShowEndConfirm(true); }}
              variant="danger"
              size="lg"
              className="flex-1"
              icon={<Square className="h-4 w-4" />}
            >
              End Shift
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
