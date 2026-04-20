"use client";

import { useEffect, useState } from "react";
import { joinPeriodLocal, splitPeriodLocal } from "@/lib/datetimeLocal";
import { inputClassNoFullWidth } from "@/lib/ui";

const inputClass = `min-w-0 flex-1 ${inputClassNoFullWidth}`;

const timeInputClass = `${inputClass} w-[7.25rem] shrink-0 font-mono tabular-nums sm:w-[7.5rem]`;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Normalize user text to `HH:mm` (24-hour, minute precision). */
function normalizeTime24Input(raw: string): string {
  const s = raw.trim();
  if (!s) return "00:00";

  const colon = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (colon) {
    let h = parseInt(colon[1], 10);
    let m = parseInt(colon[2], 10);
    if (!Number.isFinite(h)) h = 0;
    if (!Number.isFinite(m)) m = 0;
    h = Math.min(23, Math.max(0, h));
    m = Math.min(59, Math.max(0, m));
    return `${pad2(h)}:${pad2(m)}`;
  }

  const digits = s.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length === 0) return "00:00";
  if (digits.length <= 2) {
    const h = Math.min(23, Math.max(0, parseInt(digits, 10) || 0));
    return `${pad2(h)}:00`;
  }
  if (digits.length === 3) {
    const h = Math.min(23, Math.max(0, parseInt(digits[0], 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(digits.slice(1), 10) || 0));
    return `${pad2(h)}:${pad2(m)}`;
  }
  const h = Math.min(23, Math.max(0, parseInt(digits.slice(0, 2), 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(digits.slice(2, 4), 10) || 0));
  return `${pad2(h)}:${pad2(m)}`;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Optional id prefix for date/time inputs (accessibility). */
  idPrefix?: string;
};

/**
 * Date + plain text time (`HH:mm`, 24-hour). Avoids OS-dependent `type="time"` / dropdowns.
 */
export function PeriodDateTimeInputs({ value, onChange, idPrefix }: Props) {
  const { date, time } = splitPeriodLocal(value);
  const canonicalTime = time || (date ? "00:00" : "");

  const [timeDraft, setTimeDraft] = useState(canonicalTime);

  useEffect(() => {
    const { date: d, time: t } = splitPeriodLocal(value);
    setTimeDraft(t || (d ? "00:00" : ""));
  }, [value]);

  const commitTime = (nextDraft: string) => {
    const normalized = normalizeTime24Input(nextDraft);
    setTimeDraft(normalized);
    if (date) onChange(joinPeriodLocal(date, normalized));
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
      <input
        id={idPrefix ? `${idPrefix}-date` : undefined}
        type="date"
        className={inputClass}
        value={date}
        onChange={(e) => {
          const nv = e.target.value;
          if (!nv) {
            onChange("");
            return;
          }
          const tm = normalizeTime24Input(timeDraft);
          setTimeDraft(tm);
          onChange(joinPeriodLocal(nv, tm));
        }}
      />
      <input
        id={idPrefix ? `${idPrefix}-time` : undefined}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="HH:mm"
        title="24-hour time (HH:mm), e.g. 14:30"
        aria-label="Time, 24-hour HH:mm"
        disabled={!date}
        className={timeInputClass}
        value={timeDraft}
        onChange={(e) => setTimeDraft(e.target.value)}
        onBlur={() => commitTime(timeDraft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
