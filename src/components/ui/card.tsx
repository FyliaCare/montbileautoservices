"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Card ───
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  variant?: "default" | "glass" | "gradient";
}

export function Card({ padding = "md", variant = "default", className, children, ...props }: CardProps) {
  const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };
  return (
    <div
      className={cn(
        "rounded-2xl transition-all duration-200",
        variant === "default" &&
          "bg-white border border-gray-100 shadow-sm dark:bg-surface-700 dark:border-surface-600",
        variant === "glass" &&
          "glass-card shadow-lg",
        variant === "gradient" &&
          "bg-linear-to-br from-surface-700 to-surface-800 border border-surface-600",
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── Stat Card ───
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: "gold" | "forest" | "bolt" | "danger" | "info" | "default";
}

export function StatCard({ label, value, sub, icon, color = "default" }: StatCardProps) {
  const colorStyles = {
    gold: "bg-linear-to-br from-gold/10 to-gold/5 border border-gold/20 dark:from-gold/15 dark:to-gold/5 dark:border-gold/10",
    bolt: "bg-linear-to-br from-bolt/10 to-bolt/5 border border-bolt/20 dark:from-bolt/15 dark:to-bolt/5 dark:border-bolt/10",
    forest: "bg-linear-to-br from-forest/10 to-forest/5 border border-forest/20 dark:from-forest/15 dark:to-forest/5 dark:border-forest/10",
    danger: "bg-linear-to-br from-danger/10 to-danger/5 border border-danger/20 dark:from-danger/15 dark:to-danger/5 dark:border-danger/10",
    info: "bg-linear-to-br from-info/10 to-info/5 border border-info/20 dark:from-info/15 dark:to-info/5 dark:border-info/10",
    default: "bg-gray-50 border border-gray-100 dark:bg-surface-700 dark:border-surface-600",
  };
  const textStyles = {
    gold: "text-gold-dark dark:text-gold",
    bolt: "text-bolt-dark dark:text-bolt",
    forest: "text-forest-dark dark:text-forest",
    danger: "text-danger dark:text-red-400",
    info: "text-info dark:text-blue-400",
    default: "text-gray-900 dark:text-white",
  };
  return (
    <div className={cn("rounded-2xl p-4 animate-fade-in", colorStyles[color])}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        {icon && <span className="text-lg opacity-70">{icon}</span>}
      </div>
      <p className={cn("mt-1.5 text-2xl font-extrabold tracking-tight tabular", textStyles[color])}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Section Header ───
interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest dark:text-gray-500">
        {title}
      </h2>
      {action}
    </div>
  );
}
