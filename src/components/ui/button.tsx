"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "bolt" | "gold";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 select-none",
        "rounded-2xl active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
        variant === "primary" &&
          "bg-linear-to-r from-gold to-gold-dark text-white shadow-lg shadow-gold/25 hover:shadow-xl hover:shadow-gold/30 hover:brightness-110",
        variant === "bolt" &&
          "bg-linear-to-r from-bolt to-bolt-dark text-white shadow-lg shadow-bolt/25 hover:shadow-xl hover:shadow-bolt/30 hover:brightness-110",
        variant === "secondary" &&
          "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-surface-600 dark:text-white dark:hover:bg-surface-700",
        variant === "danger" &&
          "bg-linear-to-r from-danger to-red-600 text-white shadow-lg shadow-danger/20 hover:brightness-110",
        variant === "ghost" &&
          "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-700",
        variant === "outline" &&
          "border-2 border-gray-200 text-gray-700 hover:border-gold hover:text-gold dark:border-surface-600 dark:text-gray-300 dark:hover:border-bolt dark:hover:text-bolt",
        variant === "gold" &&
          "bg-linear-to-r from-gold to-gold-dark text-white shadow-lg shadow-gold/25 hover:shadow-xl hover:shadow-gold/30 hover:brightness-110",
        size === "sm" && "h-9 px-4 text-xs rounded-xl",
        size === "md" && "h-11 px-5 text-sm",
        size === "lg" && "h-13 px-6 text-base",
        size === "xl" && "h-14 px-7 text-base font-bold",
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="opacity-70">{children}</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
