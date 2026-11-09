# Node web:components:ConfirmDialog: components/ConfirmDialog.tsx
Kind: module
Language: typescript, 59 lines of code, location: web/src/components/ConfirmDialog.tsx

Source excerpt: web/src/components/ConfirmDialog.tsx (first 70 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useState } from "react";
   4  import { DIALOG_BODY_CLASSES, DIALOG_CLASSES, DIALOG_FOOTER_CLASSES } from "@/components/FinanceUI";
   5  import { Modal } from "@/components/Modal";
   6  import { DANGER_BUTTON_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";
   7  
   8  type Ask = { message: string; confirmLabel: string; resolve: (ok: boolean) => void };
   9  
  10  let ask: ((a: Ask) => void) | null = null;
  11  
  12  // In-app replacement for window.confirm(); resolves true when the user confirms.
  13  export function confirmDialog(message: string, confirmLabel = "Delete"): Promise<boolean> {
  14    return new Promise((resolve) => {
  15      if (ask) ask({ message, confirmLabel, resolve });
  16      else resolve(window.confirm(message));
  17    });
  18  }
  19  
  20  export function ConfirmHost() {
  21    const [pending, setPending] = useState<Ask | null>(null);
  22  
  23    useEffect(() => {
  24      ask = setPending;
  25      return () => {
  26        ask = null;
  27      };
  28    }, []);
  29  
  30    const answer = (ok: boolean) => {
  31      pending?.resolve(ok);
  32      setPending(null);
  33    };
  34  
  35    useEffect(() => {
  36      if (!pending) return;
  37      // Capture phase so Escape cancels only this dialog, not a modal open underneath it.
  38      const onKey = (e: KeyboardEvent) => {
  39        if (e.key !== "Escape") return;
  40        e.stopPropagation();
  41        pending.resolve(false);
  42        setPending(null);
  43      };
  44      window.addEventListener("keydown", onKey, true);
  45      return () => window.removeEventListener("keydown", onKey, true);
  46    }, [pending]);
  47  
  48    return (
  49      <Modal
  50        open={pending !== null}
  51        onClose={() => answer(false)}
  52        ariaLabelledBy="confirm-dialog-message"
  53        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
  54      >
  55        <div className={DIALOG_BODY_CLASSES}>
  56          <p id="confirm-dialog-message" className="text-base text-ink">
  57            {pending?.message}
  58          </p>
  59        </div>
  60        <div className={DIALOG_FOOTER_CLASSES}>
  61          <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={() => answer(false)}>
  62            Cancel
  63          </button>
  64          <button type="button" autoFocus className={DANGER_BUTTON_CLASSES} onClick={() => answer(true)}>
  65            {pending?.confirmLabel}
  66          </button>
  67        </div>
  68      </Modal>
  69    );
  70  }
```

## Outgoing connections
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Modal.tsx (web:components:Modal)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- layout + error (web:layout) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /settings (web:settings) -> call
- /travels (web:travels) -> call
