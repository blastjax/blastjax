"use client";

import { useEffect, useState } from "react";
import { DIALOG_BODY_CLASSES, DIALOG_FOOTER_CLASSES } from "@/components/FinanceUI";
import { Modal } from "@/components/Modal";
import { DANGER_BUTTON_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";

type Ask = { message: string; confirmLabel: string; resolve: (ok: boolean) => void };

let ask: ((a: Ask) => void) | null = null;

// In-app replacement for window.confirm(); resolves true when the user confirms.
export function confirmDialog(message: string, confirmLabel = "Delete"): Promise<boolean> {
  return new Promise((resolve) => {
    if (ask) ask({ message, confirmLabel, resolve });
    else resolve(window.confirm(message));
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Ask | null>(null);

  useEffect(() => {
    ask = setPending;
    return () => {
      ask = null;
    };
  }, []);

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  // Opened over another dialog it is the topmost layer, so Escape or a click outside answers it alone.
  return (
    <Modal open={pending !== null} onClose={() => answer(false)} ariaLabelledBy="confirm-dialog-message" size="md">
      <div className={DIALOG_BODY_CLASSES}>
        <p id="confirm-dialog-message" className="text-base text-ink">
          {pending?.message}
        </p>
      </div>
      <div className={DIALOG_FOOTER_CLASSES}>
        <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={() => answer(false)}>
          Cancel
        </button>
        <button type="button" autoFocus className={DANGER_BUTTON_CLASSES} onClick={() => answer(true)}>
          {pending?.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
