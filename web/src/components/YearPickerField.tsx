"use client";

import { useEffect, useRef, useState } from "react";
import { usePopoverPosition } from "@/lib/usePopoverPosition";
import { ICON_BUTTON_CLASSES, INPUT_CLASSES } from "@/lib/ui";

export type YearPickerFieldProps = {
  value: string;
  onChange: (year: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
};

const POPOVER_WIDTH = 260;
const GRID_YEARS = 12;

function pageStartFor(year: number): number {
  return year - 5;
}

export function YearPickerField({
  value,
  onChange,
  disabled,
  placeholder = "Select year",
  id,
}: YearPickerFieldProps) {
  const thisYear = new Date().getFullYear();
  const parsed = Number(value);
  const base = value.trim() !== "" && Number.isFinite(parsed) ? parsed : thisYear;
  const [pageStart, setPageStart] = useState(() => pageStartFor(base));
  const { triggerRef, open, position, openAt, close } =
    usePopoverPosition<HTMLInputElement>(280);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, triggerRef]);

  const openPicker = () => {
    if (disabled) return;
    setPageStart(pageStartFor(base));
    openAt(POPOVER_WIDTH);
  };

  const years = Array.from({ length: GRID_YEARS }, (_, i) => pageStart + i);

  return (
    <div className="relative">
      <input
        ref={triggerRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 4))
        }
        onFocus={openPicker}
        disabled={disabled}
        placeholder={placeholder}
        className={`${INPUT_CLASSES} w-full`}
      />
      {open && position && (
        <div
          ref={popoverRef}
          role="dialog"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: POPOVER_WIDTH,
          }}
          className="z-50 rounded-xl border border-line bg-surface p-4 shadow-pop"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPageStart((s) => s - GRID_YEARS)}
              aria-label="Previous years"
              className={ICON_BUTTON_CLASSES}
            >
              ‹
            </button>
            <div className="text-base font-semibold text-ink">{base}</div>
            <button
              type="button"
              onClick={() => setPageStart((s) => s + GRID_YEARS)}
              aria-label="Next years"
              className={ICON_BUTTON_CLASSES}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {years.map((y) => {
              const isSelected = String(y) === value;
              const isCurrent = !isSelected && y === thisYear;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    onChange(String(y));
                    close();
                  }}
                  className={[
                    "rounded-lg py-2 text-sm font-medium transition-colors duration-150",
                    isSelected
                      ? "bg-surface-2 font-semibold text-danger-text"
                      : isCurrent
                        ? "font-semibold text-brand"
                        : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  ].join(" ")}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
