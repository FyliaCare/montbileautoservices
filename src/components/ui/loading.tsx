"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ─── Full-page spinner ───
export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 dark:border-surface-600" />
          <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-bolt" />
        </div>
        <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

// ─── Inline spinner ───
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" };
  return <Loader2 className={cn("animate-spin text-bolt", sizes[size])} />;
}

// ─── Skeleton ───
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

// ─── Empty State ───
interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <span className="text-5xl mb-1 opacity-80">{icon}</span>
      <h3 className="mt-3 text-base font-bold text-gray-700 dark:text-gray-300">{title}</h3>
      {message && (
        <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 max-w-xs">{message}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
