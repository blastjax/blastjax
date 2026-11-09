# Node web:components:Modal: components/Modal.tsx
Kind: module
Language: typescript, 55 lines of code, location: web/src/components/Modal.tsx

Source excerpt: web/src/components/Modal.tsx (first 62 lines)
```
   1  "use client";
   2  
   3  import { useEffect, type ReactNode } from "react";
   4  import { DIALOG_CLASSES } from "@/components/FinanceUI";
   5  
   6  const DEFAULT_BACKDROP =
   7    "fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-6";
   8  
   9  // Pair with <ModalHeader> and DIALOG_BODY_CLASSES / DIALOG_FOOTER_CLASSES from FinanceUI.
  10  const DEFAULT_DIALOG = `${DIALOG_CLASSES} max-w-lg`;
  11  
  12  export type ModalProps = {
  13    open: boolean;
  14    onClose: () => void;
  15    dialogClassName?: string;
  16    backdropClassName?: string;
  17    ariaLabelledBy?: string;
  18    ariaLabel?: string;
  19    children: ReactNode;
  20  };
  21  
  22  export function Modal({
  23    open,
  24    onClose,
  25    dialogClassName = DEFAULT_DIALOG,
  26    backdropClassName = DEFAULT_BACKDROP,
  27    ariaLabelledBy,
  28    ariaLabel,
  29    children,
  30  }: ModalProps) {
  31    useEffect(() => {
  32      if (!open) return;
  33      const onKey = (e: KeyboardEvent) => {
  34        if (e.key === "Escape") onClose();
  35      };
  36      window.addEventListener("keydown", onKey);
  37      return () => window.removeEventListener("keydown", onKey);
  38    }, [open, onClose]);
  39  
  40    if (!open) return null;
  41    return (
  42      <div
  43        className={backdropClassName}
  44        role="presentation"
  45        onMouseDown={(e) => {
  46          if (e.target === e.currentTarget) onClose();
  47        }}
  48      >
  49        <div
  50          className={dialogClassName}
  51          style={{ overscrollBehavior: "contain" }}
  52          role="dialog"
  53          aria-modal="true"
  54          aria-labelledby={ariaLabelledBy}
  55          aria-label={ariaLabel}
  56          onMouseDown={(e) => e.stopPropagation()}
  57        >
  58          {children}
  59        </div>
  60      </div>
  61    );
  62  }
```

## Outgoing connections
- call -> components/FinanceUI.tsx (web:components:FinanceUI)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- components/ConfirmDialog.tsx (web:components:ConfirmDialog) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /travels (web:travels) -> call
