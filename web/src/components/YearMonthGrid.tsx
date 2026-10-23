import { Fragment, type ReactNode } from "react";
import { PlusIcon } from "@/components/Icons";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";

// A year laid out as twelve month cards, shared by the payslip and bills pages.
export function YearMonthGrid({
  year,
  summary,
  aside,
  renderMonth,
}: {
  year: number;
  summary?: ReactNode;
  aside?: ReactNode;
  renderMonth: (month: number, name: string) => ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1 border-b border-line-soft pb-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h3 className="font-mono text-xl font-extrabold tabular-nums text-ink">{year}</h3>
          {summary && <span className="text-[13px] text-ink-3">{summary}</span>}
        </div>
        {aside && <span className="shrink-0 font-mono text-[13px] tabular-nums">{aside}</span>}
      </header>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {MONTH_NAMES_FULL.map((name, i) => (
          <Fragment key={name}>{renderMonth(i + 1, name)}</Fragment>
        ))}
      </div>
    </section>
  );
}

export function EmptyMonth({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-4">
      <div className="mb-3 text-sm text-ink-4">{name}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function MonthCard({
  name,
  total,
  sub,
  children,
}: {
  name: string;
  total: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-ink">{name}</span>
        <span className="font-mono text-base font-semibold tabular-nums text-ink">{total}</span>
      </div>
      {sub && <div className="mt-1 flex justify-end gap-3.5 font-mono text-xs tabular-nums">{sub}</div>}
      <div className="mt-3.5 flex flex-col gap-2.5 border-t border-line-soft pt-3">{children}</div>
    </div>
  );
}

export function AddSlotButton({
  label,
  ariaLabel,
  onClick,
  disabled,
}: {
  label: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-semibold text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink-2 disabled:opacity-50"
    >
      <PlusIcon className="size-3.5" />
      {label}
    </button>
  );
}

// One entry inside a month: opens on click, with an optional action strip below.
export function MonthEntry({
  ariaLabel,
  onClick,
  footer,
  children,
}: {
  ariaLabel: string;
  onClick: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-surface-inset">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onClick}
        className="block w-full rounded-lg p-3 text-left transition-colors duration-150 hover:bg-surface-3"
      >
        {children}
      </button>
      {footer}
    </div>
  );
}

const LINE_TONE = {
  default: ["text-ink-3", "text-ink-2"],
  faint: ["text-ink-4", "text-ink-4"],
  danger: ["text-danger-text", "text-danger-text"],
} as const;

export function MonthLine({
  label,
  value,
  strong,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  tone?: keyof typeof LINE_TONE;
}) {
  const [labelTone, valueTone] = LINE_TONE[tone];
  return (
    <div className="flex justify-between gap-2 font-mono text-xs tabular-nums">
      <span className={labelTone}>{label}</span>
      <span className={strong ? "font-semibold text-ink" : valueTone}>{value}</span>
    </div>
  );
}
