"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { USERS } from "@/lib/constants";
import { Zap, Bike, Crown, ArrowLeft, Lock, ChevronRight, Shield, UserPlus } from "lucide-react";
import type { Rider } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const loginWithRiders = useAuthStore((s) => s.loginWithRiders);
  const connect = useFirebaseStore((s) => s.connect);
  const riders = useFirebaseStore((s) => s.riders);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start Firebase connection on login page
  useEffect(() => { connect(); }, [connect]);

  const selectedAccount = USERS.find((u) => u.id === selectedUser);

  const handlePinInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = pin.split("");
    newPin[index] = value.slice(-1);
    const joined = newPin.join("").slice(0, 6);
    setPin(joined);
    setError("");

    // Auto-focus next
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit on 6 digits
    if (joined.length === 6) {
      setTimeout(() => handleLogin(joined), 100);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleLogin = (pinValue: string) => {
    setLoading(true);
    const user = loginWithRiders(pinValue, riders);

    if (user) {
      setTimeout(() => {
        router.replace(user.role === "rider" ? "/rider" : "/management");
      }, 300);
    } else {
      setError("Incorrect PIN. Please try again.");
      setPin("");
      setLoading(false);
      inputRefs.current[0]?.focus();
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
    setPin("");
    setError("");
  };

  const isRider = (role: string) => role === "rider";

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden gradient-hero">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-bolt/8 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-gold/6 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-150 w-150 rounded-full bg-bolt/3 blur-[200px]" />

      {/* Content */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 py-12">

        {!selectedUser ? (
          <>
            {/* ─── Logo & Branding ─── */}
            <div className="mb-12 flex flex-col items-center animate-fade-in">
              {/* Logo icon */}
              <div className="relative mb-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-full gradient-bolt shadow-lg shadow-bolt/25 animate-bounce-in">
                  <Zap className="h-10 w-10 text-white" fill="white" strokeWidth={1.5} />
                </div>
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-full animate-glow" />
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-white">
                Montbile Auto
              </h1>
              <p className="mt-1 text-sm font-medium text-bolt/80">
                Services
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-gold/60" />
                <p className="text-xs text-gray-400 tracking-widest uppercase">
                  Takoradi, Ghana
                </p>
                <div className="h-1 w-1 rounded-full bg-gold/60" />
              </div>
            </div>

            {/* ─── Subtitle ─── */}
            <p className="mb-6 text-sm text-gray-400 animate-fade-in">
              Select your account to continue
            </p>

            {/* ─── Account Selection Cards ─── */}
            <div className="w-full space-y-3 animate-slide-up">
              {USERS.map((user, index) => {
                const rider = isRider(user.role);
                return (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user.id);
                      setTimeout(() => inputRefs.current[0]?.focus(), 200);
                    }}
                    className="group relative flex w-full items-center gap-4 rounded-2xl border border-white/6 bg-surface-700/60 p-4 tap-active transition-all duration-200 hover:border-white/12 hover:bg-surface-700/80"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    {/* Left gradient accent bar */}
                    <div
                      className={`absolute left-0 top-3 bottom-3 w-0.75 rounded-full ${
                        rider ? "gradient-bolt" : "gradient-gold"
                      }`}
                    />

                    {/* Icon */}
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        rider
                          ? "bg-bolt/10 text-bolt"
                          : "bg-gold/10 text-gold"
                      }`}
                    >
                      {rider ? (
                        <Bike className="h-6 w-6" strokeWidth={1.8} />
                      ) : (
                        <Crown className="h-6 w-6" strokeWidth={1.8} />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 text-left">
                      <p className="text-[15px] font-semibold text-white">
                        {user.name}
                      </p>
                      <p className={`text-xs font-medium ${
                        rider ? "text-bolt/70" : "text-gold/70"
                      }`}>
                        {user.role === "owner" ? "Management Portal" : "Rider Dashboard"}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ChevronRight
                      className="h-5 w-5 text-gray-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-400"
                      strokeWidth={1.8}
                    />
                  </button>
                );
              })}
            </div>

            {/* ─── Register Link ─── */}
            <div className="mt-8 w-full animate-fade-in">
              <div className="relative flex items-center mb-5">
                <div className="flex-1 h-px bg-white/8" />
                <span className="px-3 text-xs text-gray-500">New rider?</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>
              <button
                onClick={() => router.push("/register")}
                className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-bolt/20 bg-bolt/5 py-3.5 tap-active transition-all hover:border-bolt/40 hover:bg-bolt/10"
              >
                <UserPlus className="h-4.5 w-4.5 text-bolt" strokeWidth={1.8} />
                <span className="text-sm font-semibold text-bolt">Create Account</span>
              </button>
            </div>
          </>
        ) : (
          /* ─── PIN Entry Screen ─── */
          <div className="w-full animate-fade-in">
            {/* Back button */}
            <button
              onClick={handleBack}
              className="mb-8 flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white tap-active"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              <span>Back</span>
            </button>

            <div className="flex flex-col items-center animate-slide-up">
              {/* User avatar */}
              <div className="relative mb-5">
                <div
                  className={`flex h-18 w-18 items-center justify-center rounded-full ${
                    selectedAccount && !isRider(selectedAccount.role)
                      ? "bg-gold/10 ring-2 ring-gold/20"
                      : "bg-bolt/10 ring-2 ring-bolt/20"
                  }`}
                >
                  {selectedAccount && !isRider(selectedAccount.role) ? (
                    <Crown className="h-8 w-8 text-gold" strokeWidth={1.8} />
                  ) : (
                    <Bike className="h-8 w-8 text-bolt" strokeWidth={1.8} />
                  )}
                </div>
              </div>

              {/* Name */}
              <h2 className="text-xl font-bold text-white">
                {selectedAccount?.name}
              </h2>

              {/* PIN label */}
              <div className="mt-4 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                <p className="text-sm text-gray-400">
                  Enter your 6-digit PIN
                </p>
              </div>

              {/* PIN dots */}
              <div className="mt-8 flex gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="relative">
                    {/* Hidden input */}
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={pin[i] || ""}
                      onChange={(e) => handlePinInput(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      disabled={loading}
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      aria-label={`PIN digit ${i + 1}`}
                    />
                    {/* Visual dot */}
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                        pin[i]
                          ? "border-bolt bg-bolt/15 scale-95"
                          : i === pin.length
                            ? "border-white/30 bg-surface-600/50 animate-pulse-soft"
                            : "border-white/10 bg-surface-700/50"
                      }`}
                    >
                      {pin[i] ? (
                        <div className="h-3 w-3 rounded-full gradient-bolt animate-scale-in shadow-sm shadow-bolt/40" />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="mt-6 flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-2.5 animate-bounce-in">
                  <Shield className="h-4 w-4 text-danger" strokeWidth={2} />
                  <p className="text-sm text-danger font-medium">{error}</p>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="mt-8 flex flex-col items-center gap-3 animate-fade-in">
                  <div className="relative h-8 w-8">
                    <div className="absolute inset-0 rounded-full border-2 border-surface-600" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-bolt animate-spin" />
                  </div>
                  <span className="text-sm text-gray-400">Signing in…</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className="relative z-10 mt-auto pb-8 flex flex-col items-center gap-1.5">
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
