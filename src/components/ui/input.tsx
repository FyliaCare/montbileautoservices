"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        )}
        <input
          id={inputId}
          className={cn(
            "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900",
            "placeholder:text-gray-400 focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none focus:bg-white",
            "dark:border-surface-600 dark:bg-surface-700 dark:text-gray-100 dark:focus:border-bolt dark:focus:bg-surface-600",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all duration-200",
            icon && "pl-10",
            error && "border-danger focus:border-danger focus:ring-danger/20",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

// ─── Select ───
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900",
          "focus:border-bolt focus:ring-2 focus:ring-bolt/20 focus:outline-none focus:bg-white",
          "dark:border-surface-600 dark:bg-surface-700 dark:text-gray-100 dark:focus:border-bolt dark:focus:bg-surface-600",
          "transition-all duration-200",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Toggle ───
interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div>
        {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
        {description && <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-300",
          "focus:outline-none focus:ring-2 focus:ring-bolt/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          checked ? "bg-linear-to-r from-bolt to-bolt-dark" : "bg-gray-300 dark:bg-surface-600"
        )}
      >
        <span
          className={cn(
            "inline-block h-5.5 w-5.5 rounded-full bg-white shadow-md transition-transform duration-300",
            "translate-y-0.75",
            checked ? "translate-x-5.5" : "translate-x-0.75"
          )}
        />
      </button>
    </label>
  );
}
