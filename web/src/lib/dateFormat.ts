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

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDateOnlyLocal(iso);
  if (!d) return "—";
  return DATE_FORMAT.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_TIME_FORMAT.format(d);
}

export function formatMonthDayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return MONTH_DAY_FORMAT.format(d);
}

export function formatTimeLabel(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return t;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  const s = formatTimeLabel(start);
  const e = formatTimeLabel(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? e ?? null;
}
