"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav, riderTabs } from "@/components/layout/bottom-nav";
import { VoiceBot } from "@/components/voice-bot";

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const connect = useFirebaseStore((s) => s.connect);

  // Single Firebase connection for all rider pages
  useEffect(() => { connect(); }, [connect]);

  // Auth guard
  useEffect(() => {
    if (!user || user.role !== "rider") {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user || user.role !== "rider") return null;

  return (
    <div className="min-h-screen bg-white dark:bg-surface-900">
      <AppHeader />
      <main className="pb-20">{children}</main>
      <BottomNav tabs={riderTabs} />
      <VoiceBot />
    </div>
  );
}
