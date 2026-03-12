"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFirebaseStore } from "@/stores/firebase-store";
import { useShallow } from "zustand/react/shallow";
import { Zap, ArrowLeft, UserPlus, CreditCard, Phone, MapPin, Calendar, Lock, Shield, CheckCircle } from "lucide-react";
import type { Rider } from "@/lib/types";

const REGIONS = [
  "Western", "Central", "Greater Accra", "Volta", "Eastern",
  "Ashanti", "Bono", "Bono East", "Ahafo", "Northern",
  "Savannah", "North East", "Upper East", "Upper West",
  "Western North", "Oti",
];

export default function RegisterPage() {
  const router = useRouter();
  const { addRider, addNotification, connect } = useFirebaseStore(useShallow((s) => ({
    addRider: s.addRider,
    addNotification: s.addNotification,
    connect: s.connect,
  })));

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Form state
  const [form, setForm] = useState({
    name: "",
    phone: "",
    ghana_card_number: "",
    date_of_birth: "",
    gender: "male",
    hometown: "",
    region: "Western",
    licence: "",
  });
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Start Firebase
  React.useEffect(() => { connect(); }, [connect]);

  const update = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  };

  // Ghana Card format: GHA-XXXXXXXXX-X
  const isValidGhanaCard = (card: string) => {
    return /^GHA-\d{9}-\d$/.test(card.toUpperCase());
  };

  const formatGhanaCard = (value: string) => {
    // Strip non-alphanumeric
    const clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    // Auto-format: GHA-XXXXXXXXX-X
    if (clean.length <= 3) return clean;
    if (clean.length <= 12) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    return `${clean.slice(0, 3)}-${clean.slice(3, 12)}-${clean.slice(12, 13)}`;
  };

  const handlePinInput = (refs: React.MutableRefObject<(HTMLInputElement | null)[]>, setter: (v: string) => void, current: string, index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digits = current.split("");
    digits[index] = value.slice(-1);
    const joined = digits.join("").slice(0, 6);
    setter(joined);
    setError("");
    if (value && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (refs: React.MutableRefObject<(HTMLInputElement | null)[]>, current: string, index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !current[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const validateStep1 = () => {
    if (!form.name.trim()) return "Full name is required";
    if (!form.phone.trim()) return "Phone number is required";
    if (form.phone.replace(/\D/g, "").length < 10) return "Enter a valid phone number";
    return null;
  };

  const validateStep2 = () => {
    if (!form.ghana_card_number.trim()) return "Ghana Card number is required";
    if (!isValidGhanaCard(form.ghana_card_number)) return "Ghana Card format: GHA-XXXXXXXXX-X";
    if (!form.date_of_birth) return "Date of birth is required";
    return null;
  };

  const validateStep3 = () => {
    if (pin.length < 6) return "Enter a 6-digit PIN";
    if (confirmPin.length < 6) return "Confirm your PIN";
    if (pin !== confirmPin) return "PINs do not match";
    return null;
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(2);
    } else if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      setStep(3);
      setTimeout(() => pinRefs.current[0]?.focus(), 200);
    }
  };

  const handleBack = () => {
    setError("");
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else router.push("/login");
  };

  const handleRegister = async () => {
    const err = validateStep3();
    if (err) { setError(err); return; }

    setSaving(true);
    setError("");

    try {
      const rider: Rider = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        licence: form.licence.trim(),
        bike: 0,
        daily_wage: 0,
        start_date: new Date().toISOString(),
        status: "active",
        ghana_card_number: form.ghana_card_number.toUpperCase(),
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        hometown: form.hometown.trim(),
        region: form.region,
        pin: pin,
        registered_at: new Date().toISOString(),
        registration_status: "active",
        selfRegistered: true,
      };

      await addRider(rider);

      // Notify management of new rider registration
      await addNotification({
        type: "rider_added",
        title: "New Rider Registered",
        message: `${rider.name} has registered with Ghana Card ${rider.ghana_card_number}`,
        icon: "🆕",
        target_role: "management",
        read: false,
        created_at: new Date().toISOString(),
      });

      setSuccess(true);
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden gradient-hero">
        <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-bolt/8 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-gold/6 blur-[120px]" />

        <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 py-12 animate-fade-in">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bolt/15 ring-2 ring-bolt/30 mb-6 animate-bounce-in">
            <CheckCircle className="h-10 w-10 text-bolt" strokeWidth={1.8} />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Registration Complete!</h1>
          <p className="text-sm text-gray-400 text-center mb-2">
            Your account has been created successfully.
          </p>
          <p className="text-xs text-gray-500 text-center mb-8">
            You can now log in with your PIN. Management has been notified.
          </p>

          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-2xl gradient-bolt py-3.5 text-sm font-semibold text-white shadow-lg shadow-bolt/25 tap-active transition-all hover:shadow-bolt/40"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden gradient-hero">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-bolt/8 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-gold/6 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-150 w-150 rounded-full bg-bolt/3 blur-[200px]" />

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col w-full max-w-sm mx-auto px-6 py-8">

        {/* Back button */}
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white tap-active"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          <span>{step === 1 ? "Back to Login" : "Back"}</span>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-bolt shadow-md shadow-bolt/25">
            <Zap className="h-5 w-5 text-white" fill="white" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Create Account</h1>
            <p className="text-xs text-gray-400">Rider Registration</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                s <= step ? "gradient-bolt" : "bg-surface-600"
              }`} />
            </div>
          ))}
          <span className="text-xs text-gray-500 ml-2">Step {step}/3</span>
        </div>

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <div className="space-y-5 animate-slide-up">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Personal Information</h2>
              <p className="text-xs text-gray-500">Enter your basic details</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Full Name</label>
                <div className="relative">
                  <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.8} />
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="As on your Ghana Card"
                    className="w-full rounded-2xl border border-surface-600 bg-surface-700 pl-10 pr-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.8} />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="0XX XXX XXXX"
                    className="w-full rounded-2xl border border-surface-600 bg-surface-700 pl-10 pr-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Driver&apos;s Licence (Optional)</label>
                <input
                  type="text"
                  value={form.licence}
                  onChange={(e) => update("licence", e.target.value)}
                  placeholder="Licence number"
                  className="w-full rounded-2xl border border-surface-600 bg-surface-700 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Ghana Card Info */}
        {step === 2 && (
          <div className="space-y-5 animate-slide-up">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Ghana Card Details</h2>
              <p className="text-xs text-gray-500">Enter your national ID information</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Ghana Card Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.8} />
                  <input
                    type="text"
                    value={form.ghana_card_number}
                    onChange={(e) => update("ghana_card_number", formatGhanaCard(e.target.value))}
                    placeholder="GHA-XXXXXXXXX-X"
                    maxLength={16}
                    className="w-full rounded-2xl border border-surface-600 bg-surface-700 pl-10 pr-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all font-mono tracking-wider"
                  />
                </div>
                <p className="text-[11px] text-gray-600">Format: GHA-XXXXXXXXX-X</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Date of Birth</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.8} />
                  <input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => update("date_of_birth", e.target.value)}
                    className="w-full rounded-2xl border border-surface-600 bg-surface-700 pl-10 pr-4 py-3 text-sm text-gray-100 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all scheme-dark"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => update("gender", e.target.value)}
                  className="w-full rounded-2xl border border-surface-600 bg-surface-700 px-4 py-3 text-sm text-gray-100 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Hometown</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.8} />
                    <input
                      type="text"
                      value={form.hometown}
                      onChange={(e) => update("hometown", e.target.value)}
                      placeholder="e.g. Takoradi"
                      className="w-full rounded-2xl border border-surface-600 bg-surface-700 pl-10 pr-3 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Region</label>
                  <select
                    value={form.region}
                    onChange={(e) => update("region", e.target.value)}
                    className="w-full rounded-2xl border border-surface-600 bg-surface-700 px-4 py-3 text-sm text-gray-100 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none transition-all"
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Create PIN */}
        {step === 3 && (
          <div className="space-y-6 animate-slide-up">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Create Your PIN</h2>
              <p className="text-xs text-gray-500">Set a 6-digit PIN to log into your account</p>
            </div>

            {/* PIN Entry */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                <p className="text-sm text-gray-400">Enter 6-digit PIN</p>
              </div>
              <div className="flex gap-3 justify-center">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="relative">
                    <input
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={pin[i] || ""}
                      onChange={(e) => handlePinInput(pinRefs, setPin, pin, i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(pinRefs, pin, i, e)}
                      disabled={saving}
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`PIN digit ${i + 1}`}
                    />
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                      pin[i]
                        ? "border-bolt bg-bolt/15 scale-95"
                        : i === pin.length
                          ? "border-white/30 bg-surface-600/50 animate-pulse-soft"
                          : "border-white/10 bg-surface-700/50"
                    }`}>
                      {pin[i] ? (
                        <div className="h-3 w-3 rounded-full gradient-bolt shadow-sm shadow-bolt/40" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm PIN */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                <p className="text-sm text-gray-400">Confirm PIN</p>
              </div>
              <div className="flex gap-3 justify-center">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="relative">
                    <input
                      ref={(el) => { confirmPinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={confirmPin[i] || ""}
                      onChange={(e) => handlePinInput(confirmPinRefs, setConfirmPin, confirmPin, i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(confirmPinRefs, confirmPin, i, e)}
                      disabled={saving}
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`Confirm PIN digit ${i + 1}`}
                    />
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                      confirmPin[i]
                        ? pin === confirmPin
                          ? "border-green-400 bg-green-400/15 scale-95"
                          : "border-gold bg-gold/15 scale-95"
                        : i === confirmPin.length
                          ? "border-white/30 bg-surface-600/50 animate-pulse-soft"
                          : "border-white/10 bg-surface-700/50"
                    }`}>
                      {confirmPin[i] ? (
                        <div className={`h-3 w-3 rounded-full shadow-sm ${
                          pin === confirmPin ? "bg-green-400 shadow-green-400/40" : "bg-gold shadow-gold/40"
                        }`} />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {pin.length === 6 && confirmPin.length === 6 && pin === confirmPin && (
                <p className="text-xs text-green-400 text-center mt-3 animate-fade-in">PINs match ✓</p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-2.5 animate-bounce-in">
            <Shield className="h-4 w-4 text-danger shrink-0" strokeWidth={2} />
            <p className="text-sm text-danger font-medium">{error}</p>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto pt-8">
          {step < 3 ? (
            <button
              onClick={handleNext}
              className="w-full rounded-2xl gradient-bolt py-3.5 text-sm font-semibold text-white shadow-lg shadow-bolt/25 tap-active transition-all hover:shadow-bolt/40"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleRegister}
              disabled={saving || pin.length < 6 || confirmPin.length < 6 || pin !== confirmPin}
              className="w-full rounded-2xl gradient-bolt py-3.5 text-sm font-semibold text-white shadow-lg shadow-bolt/25 tap-active transition-all hover:shadow-bolt/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-transparent border-t-white animate-spin" />
                  Creating Account…
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-6 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5 opacity-40">
          <Zap className="h-3 w-3 text-bolt" fill="currentColor" strokeWidth={0} />
          <p className="text-[11px] font-medium text-gray-400 tracking-wide">
            Powered by Montbile
          </p>
        </div>
      </div>
    </div>
  );
}
