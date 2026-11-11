"use client";

import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { DIALOG_CLASSES } from "@/components/FinanceUI";

const DEFAULT_BACKDROP =
  "fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-6";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const;

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** How wide the standard dialog may grow. */
  size?: keyof typeof SIZES;
  /** Extra classes for the standard dialog. */
  className?: string;
  /** Replaces the standard dialog altogether, for a page with its own theme. */
  dialogClassName?: string;
  backdropClassName?: string;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  children: ReactNode;
};

// Pair with <ModalHeader> and DIALOG_BODY_CLASSES / DIALOG_FOOTER_CLASSES from FinanceUI.
// Radix keeps focus inside, locks the page's scroll, and lets Escape close only the topmost dialog.
// It renders in place, not in a portal, so a page's scoped theme (.travels-page) still reaches it.
export function Modal({
  open,
  onClose,
  size = "lg",
  className = "",
  dialogClassName = `${DIALOG_CLASSES} ${SIZES[size]} ${className}`,
  backdropClassName = DEFAULT_BACKDROP,
  ariaLabelledBy,
  ariaLabel,
  children,
}: ModalProps) {
  // Radix returns focus to a <Dialog.Trigger>; these dialogs are opened by plain buttons, so remember
  // what had focus as the dialog opens (before an autoFocus field inside takes it) and return there.
  const [opener, setOpener] = useState(() =>
    open && typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(document.activeElement as HTMLElement | null);
  }
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Overlay className={backdropClassName}>
        <Dialog.Content
          className={dialogClassName}
          style={{ overscrollBehavior: "contain" }}
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabel}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener?.focus();
          }}
          onEscapeKeyDown={(e) => {
            // An open list in a field (a suggestion box) takes Escape first.
            if ((e.target as Element | null)?.closest?.('[aria-expanded="true"]')) e.preventDefault();
          }}
        >
          {/* Radix looks for its own title in development; these dialogs are labelled by aria-labelledby. */}
          <Dialog.Title hidden />
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Root>
  );
}
