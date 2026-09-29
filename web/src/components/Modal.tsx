"use client";

import { useEffect, type ReactNode } from "react";
import { MODAL_DIALOG_CLASSES } from "@/lib/ui";

const DEFAULT_BACKDROP =
  "fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-6";

const DEFAULT_DIALOG = MODAL_DIALOG_CLASSES;

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  dialogClassName?: string;
  backdropClassName?: string;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  children: ReactNode;
};

export function Modal({
  open,
  onClose,
  dialogClassName = DEFAULT_DIALOG,
  backdropClassName = DEFAULT_BACKDROP,
  ariaLabelledBy,
  ariaLabel,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={backdropClassName}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={dialogClassName}
        style={{ overscrollBehavior: "contain" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
