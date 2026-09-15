"use client";

import { useEffect, type ReactNode } from "react";
import { MODAL_DIALOG_CLASSES } from "@/lib/ui";

/** Default outer container: fixed full-screen overlay with backdrop. */
const DEFAULT_BACKDROP =
  "fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-6";

/** Default dialog shell: bordered card, scrollable, theme-aware. */
const DEFAULT_DIALOG = MODAL_DIALOG_CLASSES;

export type ModalProps = {
  /** Render only when ``open`` is true. */
  open: boolean;
  /** Called when the user clicks the backdrop or presses Escape. */
  onClose: () => void;
  /** Override the dialog inner shell className. */
  dialogClassName?: string;
  /** Override the outer backdrop className. */
  backdropClassName?: string;
  /** ``aria-labelledby`` id on the dialog (point at the modal's heading). */
  ariaLabelledBy?: string;
  /** ``aria-label`` (use when there's no visible heading). */
  ariaLabel?: string;
  children: ReactNode;
};

/**
 * Shared modal shell: backdrop + dialog with the common close behaviors
 * (Escape key + click-outside) wired up exactly once.
 *
 * Three client pages (installments / house-payments / payslip) used to
 * each re-implement this; consolidating it here drops ~40 lines per page
 * and guarantees consistent a11y semantics.
 */
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
