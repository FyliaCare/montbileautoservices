"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Navigation, TrendingUp, User, LayoutDashboard, Wallet, Truck, Settings, BrainCircuit, BarChart3, MessageCircle } from "lucide-react";

interface Tab {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export const riderTabs: Tab[] = [
  { label: "Home", href: "/rider", icon: Home },
  { label: "Trips", href: "/rider/trips", icon: Navigation },
  { label: "Earnings", href: "/rider/earnings", icon: TrendingUp },
  { label: "Messages", href: "/rider/messages", icon: MessageCircle },
  { label: "Profile", href: "/rider/profile", icon: User },
];

export const managementTabs: Tab[] = [
  { label: "Dashboard", href: "/management", icon: LayoutDashboard },
  { label: "Finance", href: "/management/finance", icon: Wallet },
  { label: "Analytics", href: "/management/analytics", icon: BarChart3 },
  { label: "Simulate", href: "/management/simulations", icon: BrainCircuit },
  { label: "Fleet", href: "/management/fleet", icon: Truck },
  { label: "Settings", href: "/management/settings", icon: Settings },
];

interface BottomNavProps {
  tabs: Tab[];
}

export function BottomNav({ tabs }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    try {
      router.push(href);
    } catch {
      window.location.href = href;
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto"
    >
      <div className="mx-auto max-w-lg px-4 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200/60 shadow-lg shadow-black/5 dark:bg-surface-800/90 dark:border-surface-600/50 dark:shadow-black/30 mb-2">
          {tabs.map((tab) => {
            const normalizedPath = pathname.replace(/\/$/, "") || "/";
            const normalizedHref = tab.href.replace(/\/$/, "") || "/";
            const isActive = normalizedPath === normalizedHref;
            const Icon = tab.icon;

            return (
              <a
                key={tab.href}
                href={tab.href}
                onClick={(e) => handleNav(e, tab.href)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-3 transition-all duration-200 select-none relative",
                  isActive
                    ? "text-bolt"
                    : "text-gray-400 hover:text-gray-600 active:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300"
                )}
              >
                <div className={cn(
                  "relative flex items-center justify-center rounded-xl transition-all duration-200",
                  isActive ? "bg-bolt/10 w-12 h-8" : "w-12 h-8"
                )}>
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  isActive && "text-bolt"
                )}>
                  {tab.label}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
