"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarIcon } from "@/components/Icons";
import { usePopoverPosition } from "@/lib/usePopoverPosition";
import { INPUT_CLASSES } from "@/lib/ui";

export type PickerFieldProps = {
  label: string | null; // the value as shown, or null for the placeholder
  placeholder: string;
  popoverLabel: string;
  width: number; // narrowed to fit small screens
  estimatedHeight?: number;
  onOpen?: () => void;
  clearLabel?: string;
  onClear?: () => void;
  note?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  popoverClassName?: string;
  children: (close: () => void) => ReactNode;
};

// The trigger and popover every date, date range, month and year picker shares.
export function PickerField({
  label,
  placeholder,
  popoverLabel,
  width,
  estimatedHeight = 400,
  onOpen,
  clearLabel,
  onClear,
  note,
  disabled,
  id,
  className,
  popoverClassName,
  children,
}: PickerFieldProps) {
  const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLButtonElement>(estimatedHeight);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [shownWidth, setShownWidth] = useState(width);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, triggerRef]);

  const openPicker = () => {
    if (disabled) return;
    onOpen?.();
    const w = Math.min(width, window.innerWidth - 16);
    setShownWidth(w);
    openAt(w);
  };

  const canClear = !!clearLabel && !!onClear && label != null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className ?? INPUT_CLASSES} flex w-full items-center gap-2 text-left disabled:opacity-50`}
      >
        <CalendarIcon className="size-4 shrink-0 opacity-60" />
        {label != null ? (
          <span className="truncate">{label}</span>
        ) : (
          <span className="truncate opacity-60">{placeholder}</span>
        )}
      </button>
      {open && position && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={popoverLabel}
          style={{ position: "fixed", top: position.top, left: position.left, width: shownWidth }}
          className={`z-50 rounded-xl border p-4 ${popoverClassName ?? "border-line bg-surface shadow-pop"}`}
        >
          {children(close)}
          {(note || canClear) && (
            <div className="mt-3 flex min-h-8 items-center justify-between gap-3 border-t border-line pt-3 text-xs">
              {note ?? <span />}
              {canClear && (
                <button
                  type="button"
                  onClick={() => {
                    onClear?.();
                    close();
                  }}
                  className="rounded-md px-2 py-1 font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-400"
                >
                  {clearLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
