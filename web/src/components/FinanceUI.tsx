import type { ReactNode } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/Icons";
import { formatMonthYear } from "@/lib/dateFormat";

/**
 * Building blocks shared by the money pages (Calendar, Monthly Expenses,
 * Credit Card, Installments, House Payments), so the five read as one
 * product: a panel with a title row, a divided strip of headline numbers,
 * a meter, and one modal layout (header / scrolling body / footer).
 *
 * Colors are the semantic tokens from globals.css only.
 */

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TEXT_TONE: Record<Tone, string> = {
  neutral: "text-ink",
  brand: "text-brand-text",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

const BAR_TONE: Record<Tone, string> = {
  neutral: "bg-ink-4",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const PILL_TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-3 ring-line",
  brand: "bg-brand-soft text-brand-text ring-brand/20",
  success: "bg-success-soft text-success-text ring-success/20",
  warning: "bg-warning-soft text-warning-text ring-warning/25",
  danger: "bg-danger-soft text-danger-text ring-danger/20",
};

/** A titled card. `flush` drops the body padding for edge-to-edge lists. */
export function Panel({
  title,
  subtitle,
  actions,
  flush = false,
  className = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const head = title != null || actions != null;
  return (
    <section
      className={`min-w-0 rounded-2xl border border-line bg-surface shadow-xs ${className}`}
    >
      {head && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? (head ? "pt-3" : "") : head ? "px-5 pb-5 pt-4 sm:px-6 sm:pb-6" : "p-5 sm:p-6"}>
        {children}
      </div>
    </section>
  );
}

/** Headline numbers in one card, divided by hairlines. Pick `className` grid
 * columns so every row is full (an empty cell shows the divider color). */
export function StatStrip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-xs *:bg-surface *:p-4 sm:*:px-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const valueSize = size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base";
  return (
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-ink-3">{label}</p>
      <p className={`mt-1 truncate font-semibold tabular-nums tracking-tight ${valueSize} ${TEXT_TONE[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-4">{hint}</p>}
    </div>
  );
}

/** Progress bar; `value` is a 0–1 fraction (clamped). */
export function Meter({
  value,
  tone = "brand",
  label,
  className = "",
}: {
  value: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-2 overflow-hidden rounded-full bg-line ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${BAR_TONE[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Row-level edit/delete as an icon button with an accessible name. */
export function IconAction({
  kind,
  label,
  onClick,
  disabled,
}: {
  kind: "edit" | "delete";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = kind === "edit" ? PencilIcon : TrashIcon;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors duration-150 disabled:opacity-40 ${
        kind === "delete"
          ? "hover:bg-danger-soft hover:text-danger-text"
          : "hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** ‹ Month Year › stepper. */
export function MonthStepper({
  year,
  month,
  onPrev,
  onNext,
  disabled = false,
}: {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}) {
  const btn =
    "grid size-8 place-items-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-40";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-xs">
      <button type="button" aria-label="Previous month" className={btn} onClick={onPrev} disabled={disabled}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <span
        aria-live="polite"
        className={`min-w-[8.75rem] px-1 text-center text-sm font-semibold tabular-nums ${disabled ? "text-ink-4" : "text-ink"}`}
      >
        {formatMonthYear(year, month)}
      </span>
      <button type="button" aria-label="Next month" className={btn} onClick={onNext} disabled={disabled}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

/** Form field: label above, control, optional hint below. */
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/** Low-emphasis text buttons: brand for "+ Add …" row links, danger for a
 * modal footer's delete (pushed left, away from Save). */
export const TEXT_BUTTON_CLASSES =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-text transition-colors duration-150 hover:bg-brand-soft disabled:opacity-50";
export const DANGER_TEXT_BUTTON_CLASSES =
  "mr-auto rounded-lg px-2 py-1.5 text-sm font-medium text-danger-text transition-colors duration-150 hover:bg-danger-soft disabled:opacity-50";

/** Dialog shell for `<Modal dialogClassName>` — add a `max-w-*`. */
export const DIALOG_CLASSES =
  "flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop";
export const DIALOG_BODY_CLASSES = "min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6";
export const DIALOG_FOOTER_CLASSES =
  "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6";

export function ModalHeader({
  id,
  title,
  subtitle,
  onClose,
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-lg font-semibold text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
      >
        <CloseIcon className="size-5" />
      </button>
    </div>
  );
}

/** Placeholder blocks while a page's first fetch is in flight. */
export function LoadingBlocks({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}
