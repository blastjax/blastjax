/**
 * Canonical date/month formatting for the whole app. Locale is pinned to
 * "en-US" so text doesn't vary with the visiting browser's locale — every
 * call site used to pass `undefined`, which meant "Jul 2026" vs "Jul. 2026"
 * vs "2026年7月" depending on the reader's machine.
 */
const LOCALE = "en-US";

/**
 * Formatters are built once at module load rather than per call. `formatDate`
 * runs once per table row (installment schedules, house-payment entries,
 * credit-card payments) and `formatMonthDayShort` once per chart x-axis tick,
 * so re-resolving the locale + options on every call was pure overhead.
 */
const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MONTH_DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
});

export const MONTH_NAMES_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Canonical internal "YYYY-MM" key. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

/** "July 2026" — canonical month+year display for headings, titles, table cells, and modal labels. */
export function formatMonthYear(year: number, month: number): string {
  if (month < 1 || month > 12) return String(year);
  return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}

/** "Jul 2026" — for chart axis ticks / legends only, where space is tight. */
export function formatMonthYearShort(year: number, month: number): string {
  if (month < 1 || month > 12) return String(year);
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

/** Local (non-UTC) "YYYY-MM-DD" for a `Date` — the inverse of `parseDateOnlyLocal`,
 * used by the calendar pickers to turn a clicked day back into a plain date string. */
export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Adds `delta` months to a year/(1-12)month pair, wrapping the year — used to step a
 * calendar picker's visible month(s) forward/back without hitting `Date`'s own
 * month-rollover quirks (e.g. Feb 30 -> Mar 2). */
export function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  const total = year * 12 + (month - 1) + delta;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}

/** Parses a leading "YYYY-MM-DD" as a *local* calendar date (ignores any time/timezone
 * component), so a bare date string never shifts to the previous/next day depending on
 * the reader's timezone offset. */
export function parseDateOnlyLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

/** "Jul 21, 2026" — canonical display for a date-only (no time-of-day) value. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDateOnlyLocal(iso);
  if (!d) return "—";
  return DATE_FORMAT.format(d);
}

/** "Jul 21, 2026, 09:30 AM" — canonical display for a full timestamp. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_TIME_FORMAT.format(d);
}

/** "Jul 21" — month + day only, for chart x-axes plotted by exact date rather than by month. */
export function formatMonthDayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return MONTH_DAY_FORMAT.format(d);
}

/** "9:00" -> "09:00" — 24-hour ("military") time, zero-padded. Falls back
 * to the raw text for anything that doesn't look like an HH:MM value. */
export function formatTimeLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** "09:00 – 12:00", or just one side, or null if neither is set. */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  const s = formatTimeLabel(start);
  const e = formatTimeLabel(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? null;
}
