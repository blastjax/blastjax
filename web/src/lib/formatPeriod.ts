/** Local date/time to the minute (no seconds / milliseconds). */
export function formatPeriodDisplay(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    const d = new Date(v);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : String(v);
  }
  const s = String(v).trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Milliseconds for sorting / ordering (invalid → `null`). */
export function parsePeriodToMs(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/**
 * Local clock time within the day (ms from local midnight). Matches what
 * `toLocaleTimeString` shows for the same parsed value.
 */
export function periodTimeOfDayMsLocal(v: unknown): number | null {
  const ms = parsePeriodToMs(v);
  if (ms == null) return null;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 +
    d.getMilliseconds()
  );
}

/**
 * Same calendar day: latest local time first; midnight (00:00) last.
 * Tie-break: newer full instant first.
 */
export function comparePeriodLatestFirst(a: unknown, b: unknown): number {
  const ta = periodTimeOfDayMsLocal(a);
  const tb = periodTimeOfDayMsLocal(b);
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1;
  if (tb == null) return -1;
  if (tb !== ta) return tb - ta;
  const fa = parsePeriodToMs(a);
  const fb = parsePeriodToMs(b);
  if (fa == null && fb == null) return 0;
  if (fa == null) return 1;
  if (fb == null) return -1;
  return fb - fa;
}

/** Time of day only (same parsing as `formatPeriodDisplay`). For contexts where the date is shown elsewhere. */
export function formatPeriodTimeOnly(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    const d = new Date(v);
    return Number.isFinite(d.getTime())
      ? d.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : String(v);
  }
  const s = String(v).trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
