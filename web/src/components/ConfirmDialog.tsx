"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!pending) return;
    // Capture phase so Escape cancels only this dialog, not a modal open underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      pending.resolve(false);
      setPending(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);

  return (
    <Modal open={pending !== null} onClose={() => answer(false)} ariaLabelledBy="confirm-dialog-message">
      <p id="confirm-dialog-message" className="text-base text-ink">
        {pending?.message}
      </p>
      <div className="mt-6 flex justify-end gap-2">
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
