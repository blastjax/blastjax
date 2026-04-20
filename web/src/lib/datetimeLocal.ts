/** Append seconds for datetime-local values without them (HH:mm → HH:mm:00). */
export function localToTimestamp(v: string): string {
  if (!v) return "";
  return v.length === 16 ? `${v}:00` : v;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Default `datetime-local` value for a new transaction: **today** at **current local time**
 * (same idea as opening “add transaction” from the dashboard with no preset).
 */
export function defaultTransactionPeriodLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * `YYYY-MM-DD` at **current local time** — for picking a calendar day while keeping
 * the clock aligned with “now”, like the dashboard default.
 */
export function transactionPeriodLocalForDate(isoDate: string): string {
  const d = isoDate.trim();
  if (!ISO_DATE.test(d)) return defaultTransactionPeriodLocal();
  const now = new Date();
  return `${d}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/**
 * Convert a Period value from the API/DB (ISO-8601 instant) to `datetime-local`
 * strings for the user's **local** timezone. Avoids slicing UTC digits, which
 * broke parity with `new Date(local…)` on save.
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "";
  const raw = String(iso).trim();
  let d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const alt = raw
      .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, "$1T$2")
      .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, "$1T$2");
    d = new Date(alt);
  }
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * True when an update should send `period`: the local form value denotes a
 * different instant (to the minute) than `dbPeriodIso` from the row, or one side
 * is empty and the other is not.
 */
export function periodLocalDiffersFromDbIso(
  formLocal: string,
  dbPeriodIso: string,
): boolean {
  const formTrim = formLocal.trim();
  const dbTrim = dbPeriodIso.trim();
  const formMs = formTrim
    ? new Date(localToTimestamp(formTrim)).getTime()
    : NaN;
  const dbMs = dbTrim ? new Date(dbTrim).getTime() : NaN;
  if (!Number.isFinite(formMs) && !Number.isFinite(dbMs)) return false;
  if (!Number.isFinite(formMs) || !Number.isFinite(dbMs)) return true;
  return Math.floor(formMs / 60000) !== Math.floor(dbMs / 60000);
}

/** Split combined `YYYY-MM-DDTHH:mm` for date input + 24-hour hour/minute controls. */
export function splitPeriodLocal(period: string): { date: string; time: string } {
  const t = period.trim();
  if (!t) return { date: "", time: "" };
  const i = t.indexOf("T");
  if (i === -1) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { date: t, time: "" };
    return { date: "", time: "" };
  }
  const date = t.slice(0, i);
  const afterT = t.slice(i + 1);
  const hm = afterT.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(hm)) return { date, time: hm };
  return { date, time: "" };
}

/** Merge date + time into stored period string (minute precision). */
export function joinPeriodLocal(date: string, time: string): string {
  const d = date.trim();
  const tm = (time.trim() || "00:00").slice(0, 5);
  if (!d) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  if (!/^\d{2}:\d{2}$/.test(tm)) return "";
  return `${d}T${tm}`;
}
