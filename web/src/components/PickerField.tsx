"use client";

import { Popover } from "radix-ui";
import { useState, type ReactNode } from "react";
import { CalendarIcon } from "@/components/Icons";
import { INPUT_CLASSES } from "@/lib/ui";

export type PickerFieldProps = {
  label: string | null; // the value as shown, or null for the placeholder
  placeholder: string;
  popoverLabel: string;
  width: number; // narrowed to fit small screens
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

// The trigger and popover every date, date range, month and year picker shares. Radix places it (flipping
// above the field when there's no room below), closes it on Escape or a click outside, and returns focus.
// It renders in place, not in a portal, so a page's scoped theme (.travels-page) still reaches it.
export function PickerField({
  label,
  placeholder,
  popoverLabel,
  width,
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
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const canClear = !!clearLabel && !!onClear && label != null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={`${className ?? INPUT_CLASSES} flex w-full items-center gap-2 text-left disabled:opacity-50`}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
          {label != null ? (
            <span className="truncate">{label}</span>
          ) : (
            <span className="truncate opacity-60">{placeholder}</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Content
        aria-label={popoverLabel}
        align="start"
        sideOffset={8}
        collisionPadding={8}
        style={{ width: `min(${width}px, calc(100vw - 16px))` }}
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
                className="rounded-md px-2 py-1 font-semibold text-brand-text transition-colors hover:bg-brand-soft"
              >
                {clearLabel}
              </button>
            )}
          </div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
