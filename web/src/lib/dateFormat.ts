/**
 * Canonical date/month formatting for the whole app. Locale is pinned to
 * "en-US" so text doesn't vary with the visiting browser's locale — every
 * call site used to pass `undefined`, which meant "Jul 2026" vs "Jul. 2026"
 * vs "2026年7月" depending on the reader's machine.
 */
const LOCALE = "en-US";

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

export function formatMonthYearFromKey(key: string): string {
  const p = parseMonthKey(key);
  return p ? formatMonthYear(p.y, p.m) : key;
}

export function formatMonthYearShortFromKey(key: string): string {
  const p = parseMonthKey(key);
  return p ? formatMonthYearShort(p.y, p.m) : key;
}

/** Parses a leading "YYYY-MM-DD" as a *local* calendar date (ignores any time/timezone
 * component), so a bare date string never shifts to the previous/next day depending on
 * the reader's timezone offset. */
function parseDateOnlyLocal(iso: string): Date | null {
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
  return d.toLocaleDateString(LOCALE, { year: "numeric", month: "short", day: "numeric" });
}

/** "Jul 21, 2026, 09:30 AM" — canonical display for a full timestamp. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Jul 21" — month + day only, for chart x-axes plotted by exact date rather than by month. */
export function formatMonthDayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}
