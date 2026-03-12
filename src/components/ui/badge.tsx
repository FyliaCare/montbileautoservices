"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Badge ───
type BadgeVariant = "default" | "gold" | "green" | "red" | "blue" | "gray" | "bolt";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const badgeColors: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700 dark:bg-surface-600 dark:text-gray-300",
  gold: "bg-gold/15 text-gold-dark border border-gold/20 dark:bg-gold/10 dark:text-gold dark:border-gold/20",
  green: "bg-bolt/15 text-bolt-dark border border-bolt/20 dark:bg-bolt/10 dark:text-bolt dark:border-bolt/20",
  bolt: "bg-bolt/15 text-bolt-dark border border-bolt/20 dark:bg-bolt/10 dark:text-bolt dark:border-bolt/20",
  red: "bg-danger/10 text-danger border border-danger/20 dark:bg-danger/10 dark:text-red-400 dark:border-danger/20",
  blue: "bg-info/10 text-info border border-info/20 dark:bg-info/10 dark:text-blue-400 dark:border-info/20",
  gray: "bg-gray-100 text-gray-500 dark:bg-surface-600 dark:text-gray-400",
};

export function Badge({ children, variant = "default", dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide",
        badgeColors[variant],
        className
      )}
    >
      {dot && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          variant === "green" || variant === "bolt" ? "bg-bolt" :
          variant === "red" ? "bg-danger" :
          variant === "gold" ? "bg-gold" :
          variant === "blue" ? "bg-info" : "bg-gray-400"
        )} />
      )}
      {children}
    </span>
  );
}

// ─── Status Badge ───
export function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let variant: BadgeVariant = "gray";
  if (lower === "active" || lower === "completed" || lower === "paid") variant = "green";
  else if (lower === "inactive" || lower === "terminated") variant = "red";
  else if (lower === "pending") variant = "gold";

  return <Badge variant={variant} dot>{status}</Badge>;
}
