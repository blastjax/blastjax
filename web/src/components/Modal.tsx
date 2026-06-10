"use client";

import { useEffect, type ReactNode } from "react";

/** Default outer container: fixed full-screen overlay with backdrop. */
const DEFAULT_BACKDROP =
  "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center sm:p-6";

/** Default dialog shell: bordered card, scrollable, theme-aware. */
const DEFAULT_DIALOG =
  "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950";

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
