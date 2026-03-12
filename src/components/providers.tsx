"use client";

import React, { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { useUIStore } from "@/stores/ui-store";

// Hydration gate: waits for client mount so all Zustand persist
// stores finish rehydrating (async via microtask) before any
// children render. This prevents useSyncExternalStore snapshot
// mismatches that cause React error #185.
function HydrationGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-bolt to-bolt-dark shadow-lg shadow-bolt/30">
            <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-surface-700 border-t-bolt" />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function ThemeSync() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else if (!theme || theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        mq.matches ? root.classList.add("dark") : root.classList.remove("dark");
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <HydrationGate>
        <ThemeSync />
        {children}
      </HydrationGate>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { fontSize: "13px", borderRadius: "12px" },
          duration: 3000,
        }}
      />
    </ErrorBoundary>
  );
}
