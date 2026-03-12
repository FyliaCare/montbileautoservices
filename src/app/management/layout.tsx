"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useFirebaseStore } from "@/stores/firebase-store";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav, managementTabs } from "@/components/layout/bottom-nav";
import { VoiceBot } from "@/components/voice-bot";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isManagement = user?.role === "owner";
  const connect = useFirebaseStore((s) => s.connect);

  // Single Firebase connection for all management pages
  useEffect(() => { connect(); }, [connect]);

  // Auth guard
  useEffect(() => {
    if (!user || !isManagement) {
      router.replace("/login");
    }
  }, [user, isManagement, router]);

  if (!user || !isManagement) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-surface-900">
      <AppHeader />
      <main className="pb-20">{children}</main>
      <BottomNav tabs={managementTabs} />
      <VoiceBot />
    </div>
  );
}
