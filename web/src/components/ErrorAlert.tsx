"use client";

import { useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/Icons";
import { ERROR_ALERT_CLASSES } from "@/lib/ui";

export function ErrorAlert({ className = "", children }: { className?: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState<ReactNode>(null);
  if (dismissed === children) return null;

  return (
    <div className={`relative pr-10 ${ERROR_ALERT_CLASSES} ${className}`} role="alert">
      {children}
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={() => setDismissed(children)}
        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md opacity-60 transition-opacity duration-150 hover:bg-danger-line/40 hover:opacity-100"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
