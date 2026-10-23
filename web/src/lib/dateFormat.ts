const LOCALE = "en-US";

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

const WEEKDAY_MONTH_DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const LONG_DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
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

export function formatMonthYear(year: number, month: number): string {
  if (month < 1 || month > 12) return String(year);
  return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
}

export function formatMonthYearShort(year: number, month: number): string {
  if (month < 1 || month > 12) return String(year);
  return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  const total = year * 12 + (month - 1) + delta;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}

export function parseDateOnlyLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

// A bare "2026-10-23" is a calendar day: `new Date` would read it as UTC midnight,
// which is the previous day west of UTC. Timestamps go through `new Date` as usual.
function parseLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return parseDateOnlyLocal(iso);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? parseDateOnlyLocal(iso) : d;
}

function formatWith(format: Intl.DateTimeFormat, iso: string | null | undefined): string {
  const d = parseLocal(iso);
  return d ? format.format(d) : "—";
}

/** Oct 23, 2026 */
export function formatDate(iso: string | null | undefined): string {
  return formatWith(DATE_FORMAT, iso);
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatWith(DATE_TIME_FORMAT, iso);
}

/** Oct 23 */
export function formatMonthDayShort(iso: string | null | undefined): string {
  return formatWith(MONTH_DAY_FORMAT, iso);
}

/** Fri, Oct 23 */
export function formatWeekdayMonthDay(iso: string | null | undefined): string {
  return formatWith(WEEKDAY_MONTH_DAY_FORMAT, iso);
}

/** Friday, October 23, 2026 */
export function formatDateLong(iso: string | null | undefined): string {
  return formatWith(LONG_DATE_FORMAT, iso);
}
