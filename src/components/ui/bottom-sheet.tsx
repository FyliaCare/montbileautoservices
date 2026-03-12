"use client";

import React, { useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={cn(
          "relative w-full max-w-lg max-h-[90vh] overflow-y-auto",
          "rounded-t-3xl bg-white shadow-2xl",
          "dark:bg-surface-800 animate-slide-up"
        )}
      >
        {/* Handle */}
        <div className="sticky top-0 z-10 flex flex-col items-center bg-white pt-3 pb-2 dark:bg-surface-800">
          <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-surface-600" />
          {title && (
            <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          )}
        </div>
        <div className="px-5 pb-10">{children}</div>
      </div>
    </div>
  );
}
