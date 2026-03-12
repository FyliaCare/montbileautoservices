"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { NotificationPanel } from "./notification-panel";
import { Bell, Wifi, WifiOff, Download } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || "rider";
  const appNotifications = useFirebaseStore((s) => s.appNotifications);
  const [showNotifs, setShowNotifs] = useState(false);

  const unreadCount = useMemo(() => {
    const targetRole = role === "owner" ? "management" : role;
    return Object.values(appNotifications).filter((n) => {
      if (!n.read) {
        if (targetRole === "management") {
          return n.target_role === "management" || n.target_role === "all";
        }
        // Rider: only count their own notifications
        return (n.target_role === "rider" || n.target_role === "all") && n.actor === user?.name;
      }
      return false;
    }).length;
  }, [appNotifications, role, user?.name]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100 dark:bg-surface-900/80 dark:border-surface-700">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br from-bolt to-bolt-dark shadow-md shadow-bolt/20">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-gray-900 dark:text-white tracking-tight">Montbile</span>
              <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 -mt-0.5 tracking-wider uppercase">Auto Services</span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ConnectionDot />
            <InstallButton />

            {/* Bell */}
            <button
              onClick={() => setShowNotifs(true)}
              className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-surface-700 transition-all duration-200"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-bolt px-1 text-[9px] font-bold text-white shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* User avatar */}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-bolt/10 to-bolt/5 text-xs font-bold text-bolt dark:from-bolt/20 dark:to-bolt/5">
              {user?.name ? getInitials(user.name) : "👤"}
            </div>
          </div>
        </div>
      </header>

      <NotificationPanel open={showNotifs} onClose={() => setShowNotifs(false)} />
    </>
  );
}

function ConnectionDot() {
  const isConnected = useFirebaseStore((s) => s.isConnected);
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold",
        isConnected
          ? "text-bolt bg-bolt/10 dark:bg-bolt/15"
          : "text-gray-400 bg-gray-100 dark:bg-surface-700 dark:text-gray-500"
      )}
      title={isConnected ? "Connected" : "Connecting…"}
    >
      {isConnected ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      <span className="hidden sm:inline">{isConnected ? "Live" : "..."}</span>
    </div>
  );
}

// ─── PWA Install Button ───
// Capture beforeinstallprompt at module level so it's never missed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any = null;
let promptCaptured = false;
const listeners: Array<() => void> = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    promptCaptured = true;
    listeners.forEach((fn) => fn());
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptCaptured = false;
    listeners.forEach((fn) => fn());
  });
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true;
}

function InstallButton() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isiOSDevice, setIsiOSDevice] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true);
      return;
    }

    setIsiOSDevice(isIOS());

    // Check if prompt was already captured at module level
    if (promptCaptured && deferredPrompt) {
      setCanInstall(true);
    }

    // Subscribe to future changes
    const update = () => {
      if (deferredPrompt) setCanInstall(true);
      else {
        setCanInstall(false);
        if (!deferredPrompt && promptCaptured) setIsInstalled(true);
      }
    };
    listeners.push(update);

    return () => {
      const idx = listeners.indexOf(update);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    // iOS — show guide
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setCanInstall(false);
      setIsInstalled(true);
    }
    deferredPrompt = null;
  }, []);

  // Already installed
  if (isInstalled) return null;
  // Show for iOS or when browser offered install
  if (!canInstall && !isiOSDevice) return null;

  return (
    <>
      <button
        onClick={handleInstall}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bolt/10 dark:bg-bolt/15 text-bolt hover:bg-bolt/20 dark:hover:bg-bolt/25 transition-colors tap-active"
        aria-label="Install app"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span className="text-[10px] font-bold uppercase tracking-wide">Install</span>
      </button>

      {/* iOS Install Guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 backdrop-blur-sm"
             onClick={() => setShowIOSGuide(false)}>
          <div className="w-full max-w-md bg-white dark:bg-surface-800 rounded-t-3xl p-6 pb-10 shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 dark:bg-surface-600 mb-5" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Install Montbile</h3>
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bolt/10 text-bolt font-bold text-xs">1</span>
                <p>Tap the <strong>Share</strong> button <span className="inline-block text-lg align-middle">⬆</span> at the bottom of Safari</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bolt/10 text-bolt font-bold text-xs">2</span>
                <p>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bolt/10 text-bolt font-bold text-xs">3</span>
                <p>Tap <strong>Add</strong> — the app icon will appear on your home screen</p>
              </div>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full py-3 rounded-2xl bg-bolt text-white font-bold text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
