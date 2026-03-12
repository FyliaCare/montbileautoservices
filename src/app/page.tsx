"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export default function SplashPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!user) {
        router.replace("/login");
      } else if (user.role === "rider") {
        router.replace("/rider");
      } else {
        router.replace("/management");
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [user, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-gold/10 to-white dark:from-gold/5 dark:to-gray-950">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <span className="text-6xl">🛺</span>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Montbile Auto Services
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pragya Fleet Management
        </p>
        <div className="mt-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gold" />
      </div>
    </div>
  );
}
