"use client";

import { AmountInput } from "@/components/AmountInput";
import { PencilIcon, TrashIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  createLottoAttempt,
  deleteLottoAttempt,
  deleteLottoDraw,
  getLottoDraws,
  importLottoDrawResultsText,
  setLottoDraw,
  updateLottoDraw,
  type LottoAttemptRow,
  type LottoDrawDetail,
} from "@/lib/api";
import { formatDate, formatMonthDayShort } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";
import {
  ACTION_BUTTON_CLASSES,
  ADD_BUTTON_CLASSES,
  CARD_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  ICON_BUTTON_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
  alertClasses,
} from "@/lib/ui";

/** Success-tone banner box, matching ui.ts's `ERROR_ALERT_CLASSES` pattern
 * (border + tinted background + tinted text, no shadow) for the tone it
 * doesn't cover. */

const NUMBERS_HELP =
  "6 unique numbers, 1-58 — separate with commas, spaces, or dashes (e.g. 3, 17, 29, 42, 58, 1 or 03-17-29-42-58-01)";

const DRAW_DATE_HELP =
  "MM/DD/YYYY, MM-DD-YYYY, or MM DD YYYY — 2- or 4-digit year (e.g. 8/28/2026, 08-28-26, 8 28 2026)";

/** Turns a validated y/m/d into "YYYY-MM-DD", rejecting dates like Feb 30. */
function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Enter a valid date.");
  }
  return date.toISOString().slice(0, 10);
}

/** The stored "YYYY-MM-DD" -> "M/D/YYYY", for pre-filling the date field
 * when editing an existing draw. */
function isoToUsDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

/** Two-digit years pivot the same way POSIX strptime's %y does: 00-68 lands
 * in the 2000s, 69-99 in the 1900s. Lotto history doesn't reach back past
 * that, so the pivot never actually has to bite. */
function twoDigitYearToFour(yy: number): number {
  return yy <= 68 ? 2000 + yy : 1900 + yy;
}

/** Accepts a typed date separated by "/", "-", or spaces, with a 2- or
 * 4-digit year — e.g. "8/28/2026", "08-28-26", "8 28 2026". */
function parseDrawDate(text: string): string {
  const trimmed = text.trim();
  const m = /^(\d{1,2})[/\-\s]+(\d{1,2})[/\-\s]+(\d{2}|\d{4})$/.exec(trimmed);
  if (m) {
    const [, mo, d, y] = m;
    const year = y.length === 2 ? twoDigitYearToFour(Number(y)) : Number(y);
    return toIsoDate(year, Number(mo), Number(d));
  }
  throw new Error(`Enter a date as ${DRAW_DATE_HELP}.`);
}

function parseNumbers(text: string): number[] {
  const parts = text.split(/[^0-9]+/).filter((p) => p.length > 0);
  if (parts.length !== 6) {
    throw new Error("Enter exactly 6 numbers.");
  }
  const numbers = parts.map((p) => Number(p));
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 58)) {
    throw new Error("Each number must be a whole number between 1 and 58.");
  }
  if (new Set(numbers).size !== numbers.length) {
    throw new Error("Numbers must be unique.");
  }
  return [...numbers].sort((a, b) => a - b);
}

function numbersToText(numbers: number[]): string {
  return numbers.join(", ");
}

/** "5, 17, 29" -> "05-17-29" — the zero-padded, dash-joined shape every txt
 * export (historic results and attempts alike) writes numbers in. */
function numbersToDashString(numbers: number[]): string {
  return numbers.map((n) => String(n).padStart(2, "0")).join("-");
}

/** `292772750.79` -> "292.77M" — the current-jackpot tile's own compact
 * form, since a nine-figure jackpot is the one amount on this page too big
 * for `fmtAmountOrDash`'s full-precision dollar figure to sit next to a
 * bare match score. Below a million, just the plain amount. */
function fmtJackpotCompact(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : fmtAmountOrDash(n);
}

/** The stored "YYYY-MM-DD" -> "M/D/YYYY", for a txt export row. Distinct
 * from `isoToUsDate` above only in name — this one's for text going out to
 * a file, not into a form field, but the format the exports use matches
 * what `parseDrawDate` reads back in. */
function isoToExportDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

/** Triggers a browser download of `text` as a UTF-8 .txt file named
 * `filename`, without navigating away from the page. */
function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A logged attempt whose numbers exactly match some *other* draw's result
 * somewhere else in the history — "if only you'd played this combo on that
 * date instead." Excludes an attempt matching the very draw it was logged
 * against — that's just a 6/6 winner, already highlighted in the draw card
 * itself, not a coincidence worth calling out here. */
type WhatIfMatch = {
  key: string;
  attempt: LottoAttemptRow;
  numbers: number[];
  loggedDrawId: number;
  loggedDrawDate: string;
  matchedDrawDate: string;
};

/** Scans every attempt against every draw result in `draws` for an exact
 * 6-number match to a different draw than the one the attempt was logged
 * under. `draws` order doesn't matter — the result is sorted newest-match
 * first before it's returned. */
function findWhatIfMatches(draws: LottoDrawDetail[]): WhatIfMatch[] {
  const resultsByKey = new Map<string, { id: number; date: string }[]>();
  for (const detail of draws) {
    if (detail.draw.numbers.length !== 6) continue;
    const key = [...detail.draw.numbers].sort((a, b) => a - b).join("-");
    const hits = resultsByKey.get(key);
    const entry = { id: detail.draw.id, date: detail.draw.draw_date };
    if (hits) hits.push(entry);
    else resultsByKey.set(key, [entry]);
  }

  const matches: WhatIfMatch[] = [];
  for (const detail of draws) {
    for (const attempt of detail.attempts) {
      const key = [...attempt.numbers].sort((a, b) => a - b).join("-");
      for (const hit of resultsByKey.get(key) ?? []) {
        if (hit.id === detail.draw.id) continue;
        matches.push({
          key: `${attempt.id}-${hit.id}`,
          attempt,
          numbers: attempt.numbers,
          loggedDrawId: detail.draw.id,
          loggedDrawDate: detail.draw.draw_date,
          matchedDrawDate: hit.date,
        });
      }
    }
  }
  return matches.sort((a, b) => b.matchedDrawDate.localeCompare(a.matchedDrawDate));
}

/** One draw's raw fields for a historic-results export row — still
 * unpadded, since padding needs every row's widths known first. Draws with
 * no result yet have no numbers to put in a row, so they're left out. */
type ExportFields = { numbers: string; date: string; jackpot: string; winners: string };

function drawToExportFields(detail: LottoDrawDetail): ExportFields | null {
  if (detail.draw.numbers.length !== 6) return null;
  const jackpot = (detail.draw.jackpot_prize ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    numbers: numbersToDashString(detail.draw.numbers),
    date: isoToExportDate(detail.draw.draw_date),
    jackpot,
    winners: String(detail.draw.winners),
  };
}

/** `draws` newest-first -> oldest-first for the export, matching how a
 * historic results file naturally reads top to bottom. Every column is
 * padded to its widest value so the `|` separators line up down the file —
 * purely cosmetic, since "Import historic results" already tolerates
 * arbitrary whitespace around each field. */
function buildLottoExportText(draws: LottoDrawDetail[]): string {
  const rows = [...draws]
    .reverse()
    .map(drawToExportFields)
    .filter((fields): fields is ExportFields => fields != null);
  if (rows.length === 0) return "";

  const width = (key: keyof ExportFields) => Math.max(...rows.map((r) => r[key].length));
  const widths = {
    numbers: width("numbers"),
    date: width("date"),
    jackpot: width("jackpot"),
    winners: width("winners"),
  };

  return rows
    .map(
      (r) =>
        `| ${r.numbers.padEnd(widths.numbers)} | ${r.date.padEnd(widths.date)} | ` +
        `${r.jackpot.padStart(widths.jackpot)} | ${r.winners.padStart(widths.winners)} |`,
    )
    .join("\n");
}

/** Renders a draw's attempts in the same blank-line-separated "ticket
 * blocks" shape "Paste attempts" reads: attempts sharing a ticket number
 * are grouped under a "Ticket N" header, one 6-number line per attempt;
 * attempts with no ticket each stand alone as their own headerless block.
 * Pasting this text back in recreates every attempt — though since pasting
 * turns every block into a ticket (see `submitPasteAttempts`), a previously
 * ungrouped attempt comes back with a new ticket number of its own rather
 * than staying ungrouped. That's a limitation of the paste format, not
 * something this exporter can route around. */
function attemptsToTicketBlocksText(attempts: LottoAttemptRow[]): string {
  const byTicket = new Map<number, LottoAttemptRow[]>();
  const loose: LottoAttemptRow[] = [];
  for (const a of attempts) {
    if (a.ticket != null) {
      const arr = byTicket.get(a.ticket);
      if (arr) arr.push(a);
      else byTicket.set(a.ticket, [a]);
    } else {
      loose.push(a);
    }
  }
  const lineFor = (a: LottoAttemptRow) => numbersToDashString(a.numbers);

  const blocks: string[] = [];
  for (const ticket of [...byTicket.keys()].sort((a, b) => a - b)) {
    blocks.push([`Ticket ${ticket}`, ...byTicket.get(ticket)!.map(lineFor)].join("\n"));
  }
  for (const a of loose) {
    blocks.push(lineFor(a));
  }
  return blocks.join("\n\n");
}

/** `draws` newest-first -> oldest-first, matching `buildLottoExportText`.
 * Draws with no attempts logged are skipped — nothing to export for them.
 * Each draw's section opens with a date + result header (not part of the
 * "Paste attempts" grammar, so this file is for reading, not pasting back
 * in whole) followed by its attempts in the usual ticket-block shape. */
function buildAllAttemptsExportText(draws: LottoDrawDetail[]): string {
  const withAttempts = [...draws].reverse().filter((d) => d.attempts.length > 0);
  return withAttempts
    .map((d) => {
      const result =
        d.draw.numbers.length === 6
          ? `result ${numbersToDashString(d.draw.numbers)}`
          : "result not in yet";
      const header = `${isoToExportDate(d.draw.draw_date)} - ${result}`;
      const body = attemptsToTicketBlocksText(d.attempts);
      return `${header}\n${body}`;
    })
    .join("\n\n");
}

/** Like `parseNumbers`, but blank input means "no result yet" rather than an
 * error — a draw can be logged by date alone before its numbers are known. */
function parseOptionalNumbers(text: string): number[] | null {
  if (text.trim() === "") return null;
  return parseNumbers(text);
}

/** Blank means "not set yet" (kept as `null`, same as before a jackpot's
 * announced). Accepts comma thousands separators, e.g. "50,000,000". */
function parseOptionalJackpot(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Jackpot prize must be zero or greater.");
  }
  return n;
}

/** Blank means zero winners. */
function parseWinners(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("Winners must be a whole number, zero or greater.");
  }
  return n;
}

/** A blank line's worth of numbers-lines grouped together — one physical
 * ticket, holding each of its board plays (attempts). */
type TicketBlock = { ticket: number | null; attempts: number[][] };

const TICKET_HEADER_RE = /^ticket\s*#?\s*(\d+)\s*:?$/i;

function parseTicketBlock(lines: string[], blockIndex: number): TicketBlock {
  let ticket: number | null = null;
  let numberLines = lines;
  const header = TICKET_HEADER_RE.exec(lines[0].trim());
  if (header) {
    ticket = Number(header[1]);
    numberLines = lines.slice(1);
  }
  if (numberLines.length === 0) {
    throw new Error(`Ticket ${blockIndex + 1} has no numbers under it.`);
  }
  const attempts = numberLines.map((line, i) => {
    try {
      return parseNumbers(line);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid numbers";
      throw new Error(`Ticket ${blockIndex + 1}, line ${i + 1}: ${msg}`);
    }
  });
  return { ticket, attempts };
}

/** Pasted attempt text is one or more tickets, each a blank-line-separated
 * group of lines — every line under a ticket is one attempt's 6 numbers. A
 * ticket's first line may optionally read "ticket N" to pin its number
 * explicitly; otherwise tickets are numbered in the order they're pasted. */
function parseTicketsText(text: string): TicketBlock[] {
  const rawLines = text.split(/\r?\n/);
  const blocks: TicketBlock[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      blocks.push(parseTicketBlock(current, blocks.length));
      current = [];
    }
  };
  for (const line of rawLines) {
    if (line.trim() === "") {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  if (blocks.length === 0) {
    throw new Error("Paste in some numbers first.");
  }
  return blocks;
}

/** Blank means "not part of a ticket group". */
function parseOptionalTicket(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("Ticket # must be a positive whole number.");
  }
  return n;
}

/** The body of the attempts modal: one 6-number attempt per non-blank line,
 * whether adding fresh attempts or replacing an edited set. */
function parseAttemptsLines(text: string): number[][] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    throw new Error("Enter at least one set of numbers.");
  }
  return lines.map((line, i) => {
    try {
      return parseNumbers(line);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid numbers";
      throw new Error(`Line ${i + 1}: ${msg}`);
    }
  });
}

function NumberBall({
  n,
  variant = "neutral",
  size = "md",
}: {
  n: number;
  variant?: "neutral" | "result" | "match" | "miss";
  /** "lg" is 3x the "md" ball — used for the hero draw's own numbers, where
   * they're the single most important thing on the page. */
  size?: "md" | "lg";
}) {
  const styles: Record<string, string> = {
    neutral:
      "border-line-strong bg-surface text-ink",
    result:
      "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100",
    match:
      "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-500 dark:bg-emerald-600",
    miss: "border-line-strong bg-surface-2 text-ink-3",
  };
  const sizeClasses =
    size === "lg"
      ? "h-[84px] w-[84px] text-[28px] sm:h-[108px] sm:w-[108px] sm:text-[36px]"
      : "h-7 w-7 text-xs sm:h-9 sm:w-9 sm:text-sm";
  return (
    <span
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums ${styles[variant]}`}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** An attempt row's own number, inside a ticket card — an equal-width grid
 * cell rather than `NumberBall`'s fixed-size circle, so a row of six lines
 * up edge-to-edge with the score cell beside it (this is what changes,
 * ball-shaped numbers elsewhere — draw results, ranked list — are unaffected). */
function NumberChip({ n, variant = "neutral" }: { n: number; variant?: "neutral" | "match" | "miss" }) {
  const styles: Record<string, string> = {
    neutral: "border-transparent bg-surface-2 text-ink-2",
    match:
      "border-emerald-400/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    miss: "border-transparent bg-surface-2 text-ink-4",
  };
  return (
    <span
      className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums ${styles[variant]}`}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** The same tinted-card stat-tile language SalaryStatsClient uses for its
 * All-time Summary — label in tracked-out caps, value large and bold, both
 * in one tone. Reused here so the page's own "at a glance" strip looks like
 * it belongs to the same app instead of inventing a new visual idiom. */
const STAT_TILE_TONES = {
  indigo: {
    card: "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30",
    label: "text-indigo-700 dark:text-indigo-400",
    value: "text-indigo-900 dark:text-indigo-200",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30",
    label: "text-emerald-700 dark:text-emerald-400",
    value: "text-emerald-900 dark:text-emerald-200",
  },
  sky: {
    card: "border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/30",
    label: "text-sky-700 dark:text-sky-400",
    value: "text-sky-900 dark:text-sky-200",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30",
    label: "text-amber-700 dark:text-amber-400",
    value: "text-amber-900 dark:text-amber-200",
  },
} as const;

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TILE_TONES;
}) {
  const t = STAT_TILE_TONES[tone];
  return (
    <div className={`rounded-lg border p-3 ${t.card}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${t.label}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${t.value}`}>{value}</p>
    </div>
  );
}

/** Moves the items matching `shouldBump` to the front, otherwise leaving the
 * list exactly as it was — a stable partition, not a sort, so items never
 * get reordered relative to their own kind. */
function bumpMatches<T>(items: T[], shouldBump: (item: T) => boolean): T[] {
  const bumped: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (shouldBump(item) ? bumped : rest).push(item);
  }
  return [...bumped, ...rest];
}

/** Derived analytics for the Insights tab — every number's play/draw
 * frequency, the match-count histogram, and the roll-up stats built from
 * them. Computed fresh from `draws` each time the tab is viewed rather than
 * memoized: the corpus is a personal lotto history (thousands of attempts at
 * most), so a plain pass over it is cheap enough not to bother caching. */
/** Board-coverage banding, least-played to most-played. `never` is the only
 * one that's an absolute (zero attempts ever); the other four are quartiles
 * of the numbers that *have* been played — see `buildInsights`. */
type BoardTier = "never" | "least" | "secondLeast" | "sometimes" | "most";

type InsightsData = {
  histCounts: number[];
  totalScored: number;
  avgMatch: number;
  hitRate3: number;
  neverDrawnCount: number;
  favourites: { n: number; played: number; drawn: number }[];
  board: { n: number; played: number; tier: BoardTier }[];
  latestDrawSet: Set<number>;
};

/** A cell's look: its frequency band, or `latest` when the number came up
 * in the most recent result — that overrides the band, since "this just got
 * drawn" is the thing you want to spot first. */
type BoardSwatch = BoardTier | "latest";

/** One place for each swatch, so the board cells and the legend under them
 * can't drift apart.
 *
 * Steps are two full zinc stops apart and run in opposite directions per
 * theme — brighter means more-played against dark mode's near-black card,
 * darker means more-played against light mode's white one. Earlier passes
 * tried to do this with opacities off one grey (`/10`, `/90`) and the
 * middle bands were impossible to tell apart; at the ends, a fill close to
 * the card color read as an empty cell. Each band also carries its own text
 * color, flipping once the fill gets lighter than the text would be. */
const BOARD_SWATCH_CLASSES: Record<BoardSwatch, string> = {
  never: "border border-dashed border-line-strong text-ink-4",
  least: "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300",
  secondLeast: "bg-zinc-400 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100",
  sometimes: "bg-zinc-600 text-white dark:bg-zinc-400 dark:text-zinc-900",
  most: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  latest: "bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950",
};

const BOARD_SWATCH_LABELS: Record<BoardSwatch, string> = {
  never: "Never played",
  least: "Least",
  secondLeast: "Second least",
  sometimes: "Sometimes",
  most: "Most",
  latest: "In latest result",
};

/** Legend order: the frequency ramp least-to-most, then the overlay. */
const BOARD_LEGEND: BoardSwatch[] = [
  "never",
  "least",
  "secondLeast",
  "sometimes",
  "most",
  "latest",
];

/** Linear-interpolated quantile over an ascending list — the same method
 * `numpy`/`statistics.quantiles(..., method="inclusive")` use, so the
 * boundaries match what you'd get checking this against the database. */
function quantile(ascending: number[], q: number): number {
  if (ascending.length === 0) return 0;
  const pos = (ascending.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? ascending[lo] : ascending[lo] + (ascending[hi] - ascending[lo]) * (pos - lo);
}

function buildInsights(draws: LottoDrawDetail[]): InsightsData {
  const played = new Map<number, number>();
  const drawn = new Map<number, number>();
  const histCounts = [0, 0, 0, 0, 0, 0, 0];
  let totalScored = 0;
  let matchSum = 0;
  let hits3 = 0;
  let latestDrawSet = new Set<number>();
  let sawLatest = false;

  for (const d of draws) {
    const hasResult = d.draw.numbers.length === 6;
    if (hasResult) {
      if (!sawLatest) {
        latestDrawSet = new Set(d.draw.numbers);
        sawLatest = true;
      }
      for (const n of d.draw.numbers) drawn.set(n, (drawn.get(n) ?? 0) + 1);
    }
    const drawSet = new Set(d.draw.numbers);
    for (const a of d.attempts) {
      for (const n of a.numbers) played.set(n, (played.get(n) ?? 0) + 1);
      if (hasResult) {
        const score = a.numbers.filter((n) => drawSet.has(n)).length;
        histCounts[score] += 1;
        totalScored += 1;
        matchSum += score;
        if (score >= 3) hits3 += 1;
      }
    }
  }

  const favourites = [...played.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([n, p]) => ({ n, played: p, drawn: drawn.get(n) ?? 0 }));

  // Band by quartile of the *observed* play counts, not by a fraction of
  // the single most-played number. Play counts bunch up (every number gets
  // picked sooner or later — a real history runs something like 30-63 plays
  // each), so slicing 0..max into quarters puts every number in the top two
  // bands and leaves the bottom two permanently empty. Quartiles of the
  // numbers actually played put ~a quarter of the board in each band, which
  // is what "least played" vs "most played" is supposed to mean.
  const counts = Array.from({ length: 58 }, (_, i) => played.get(i + 1) ?? 0);
  const playedAscending = counts.filter((v) => v > 0).sort((a, b) => a - b);
  const q1 = quantile(playedAscending, 0.25);
  const q2 = quantile(playedAscending, 0.5);
  const q3 = quantile(playedAscending, 0.75);
  const board = counts.map((count, i) => ({
    n: i + 1,
    played: count,
    tier: (count === 0
      ? "never"
      : count <= q1
        ? "least"
        : count <= q2
          ? "secondLeast"
          : count <= q3
            ? "sometimes"
            : "most") as BoardTier,
  }));
  const neverDrawnCount = [...played.keys()].filter((n) => !drawn.has(n)).length;

  return {
    histCounts,
    totalScored,
    avgMatch: totalScored > 0 ? matchSum / totalScored : 0,
    hitRate3: totalScored > 0 ? (hits3 / totalScored) * 100 : 0,
    neverDrawnCount,
    favourites,
    board,
    latestDrawSet,
  };
}

type DrawModalState = {
  open: boolean;
  drawId: number | null;
  drawDate: string;
  numbersText: string;
  jackpotText: string;
  winnersText: string;
  isEdit: boolean;
};
/** Adds or replaces a *set* of attempts on one draw — one textarea line per
 * attempt, all sharing one ticket. `editingIds` is empty for a plain add;
 * non-empty means "replace these attempts with whatever's parsed from the
 * text" (see `submitAttemptsModal`), which is how both "edit a ticket" (many
 * ids) and "edit a single ungrouped attempt" (one id) are the same code
 * path — a ticket is just a set of attempts sharing a number, and an
 * ungrouped attempt is a set of size one sharing nothing. */
type AttemptsModalState = {
  open: boolean;
  drawId: number | null;
  editingIds: number[];
  attemptsText: string;
  ticketText: string;
  mode: "add" | "edit";
};
type PasteAttemptsModalState = {
  open: boolean;
  drawDate: string;
  attemptsText: string;
};
type ImportModalState = { open: boolean; text: string };
type ImportSummary = { inserted: number; updated: number; total: number; errors: string[] };

const emptyDrawModal: DrawModalState = {
  open: false,
  drawId: null,
  drawDate: "",
  numbersText: "",
  jackpotText: "",
  winnersText: "",
  isEdit: false,
};
const emptyAttemptsModal: AttemptsModalState = {
  open: false,
  drawId: null,
  editingIds: [],
  attemptsText: "",
  ticketText: "",
  mode: "add",
};
const emptyPasteModal: PasteAttemptsModalState = { open: false, drawDate: "", attemptsText: "" };
const emptyImportModal: ImportModalState = { open: false, text: "" };

type LottoTab = "draw" | "history" | "insights";
const TAB_LABELS: Record<LottoTab, string> = {
  draw: "This draw",
  history: "History",
  insights: "Insights",
};

// A minimum match count — 0 means "all", 6 means only a jackpot line.
type AttemptFilter = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const ATTEMPT_FILTERS: AttemptFilter[] = [0, 1, 2, 3, 4, 5, 6];
const FILTER_LABELS: Record<AttemptFilter, string> = {
  0: "All",
  1: "≥1",
  2: "≥2",
  3: "≥3",
  4: "≥4",
  5: "≥5",
  6: "6/6",
};

type AttemptSort = "ticket" | "best";
const SORT_LABELS: Record<AttemptSort, string> = {
  ticket: "By ticket",
  best: "Best first",
};

/** Which card's Edit/Delete icons are currently revealed — a draw, one
 * ticket on a draw, or a single ungrouped attempt. `null` means none. Only
 * one card at a time (double-clicking a new one swaps in for the old). */
type RevealedActions =
  | { type: "draw"; drawId: number }
  | { type: "ticket"; drawId: number; ticket: number }
  | { type: "attempt"; drawId: number; attemptId: number }
  | null;

export default function LottoClient() {
  const [draws, setDraws] = useState<LottoDrawDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import/export/paste are bulk data-management actions, not the thing
  // most visits to this page are for — tucked behind one toggle instead of
  // four buttons competing with the page's actual content for attention.
  const [showDataTools, setShowDataTools] = useState(false);

  const [activeTab, setActiveTab] = useState<LottoTab>("draw");

  // Refine "This draw"'s attempt list without touching History — these two
  // only apply to the hero draw (see `renderDrawCard`'s `hero` option).
  const [attemptFilter, setAttemptFilter] = useState<AttemptFilter>(0);
  const [attemptSort, setAttemptSort] = useState<AttemptSort>("ticket");
  // A draw/ticket/attempt card's Edit/Delete icons live behind a
  // double-click instead of sitting on the card face all the time — this
  // tracks which card currently has them revealed.
  const [revealedActions, setRevealedActions] = useState<RevealedActions>(null);
  // Toggle: double-clicking the already-revealed card hides its icons
  // again; double-clicking a different one swaps the reveal over to it.
  const toggleRevealed = (target: NonNullable<RevealedActions>) => {
    setRevealedActions((cur) => (cur && JSON.stringify(cur) === JSON.stringify(target) ? null : target));
  };

  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  // History tab shows one compact row per draw; clicking one opens it in a
  // modal using the same hero treatment as "This draw" (result balls,
  // filter/sort, ticket grid) rather than navigating away.
  const [historyModalDrawId, setHistoryModalDrawId] = useState<number | null>(null);

  const toggleCollapsed = (drawId: number) => {
    setCollapsedIds((s) => {
      const next = new Set(s);
      if (next.has(drawId)) next.delete(drawId);
      else next.add(drawId);
      return next;
    });
  };

  // Draws are grouped into one card per year so a history spanning many
  // years doesn't render as one endless flat list; every year starts
  // collapsed and expands on click.
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

  const toggleYearExpanded = (year: string) => {
    setExpandedYears((s) => {
      const next = new Set(s);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  // A draw with no attempts has nothing to collapse, so it's never
  // collapsible — only draws with attempts participate in collapse state.
  const collapsibleDraws = draws.filter((d) => d.attempts.length > 0);

  const allCollapsed =
    collapsibleDraws.length > 0 && collapsibleDraws.every((d) => collapsedIds.has(d.draw.id));

  const toggleCollapseAll = () => {
    setCollapsedIds((s) => {
      const allAreCollapsed =
        collapsibleDraws.length > 0 && collapsibleDraws.every((d) => s.has(d.draw.id));
      return allAreCollapsed ? new Set() : new Set(collapsibleDraws.map((d) => d.draw.id));
    });
  };

  const whatIfMatches = useMemo(() => findWhatIfMatches(draws), [draws]);

  // A one-glance orientation strip — the record to beat, and what's at
  // stake next. `bestMatch` is -1 (rendered as "—") until at least one
  // attempt has actually been checked against a real result. `draws` is
  // newest-first, so the first jackpot found scanning from the top is the
  // most recent draw that has one set.
  const overviewStats = useMemo(() => {
    let bestMatch = -1;
    let bestMatchDate: string | null = null;
    for (const d of draws) {
      if (d.draw.numbers.length !== 6) continue;
      const drawSet = new Set(d.draw.numbers);
      for (const a of d.attempts) {
        const count = a.numbers.filter((n) => drawSet.has(n)).length;
        if (count > bestMatch) {
          bestMatch = count;
          bestMatchDate = d.draw.draw_date;
        }
      }
    }
    const currentJackpotDraw = draws.find((d) => d.draw.jackpot_prize != null)?.draw ?? null;
    return { bestMatch, bestMatchDate, currentJackpotDraw };
  }, [draws]);

  // Normally "This draw" is just the newest draw. But a draw you're still
  // waiting on results for — one with attempts already logged — is more
  // useful there than an older draw's result, even if it isn't the newest
  // by date. `draws` is sorted newest-first, so `find` picks the most
  // recent such pending draw.
  const pinnedDraw =
    draws.find((d) => d.attempts.length > 0 && d.draw.numbers.length !== 6) ?? draws[0];

  // `draws` is already sorted newest-first, so same-year draws are always
  // contiguous — one pass buckets them into ordered year groups for the
  // History tab.
  const yearGroups: { year: string; items: LottoDrawDetail[] }[] = [];
  for (const detail of draws) {
    const year = detail.draw.draw_date.slice(0, 4);
    const last = yearGroups[yearGroups.length - 1];
    if (last && last.year === year) {
      last.items.push(detail);
    } else {
      yearGroups.push({ year, items: [detail] });
    }
  }

  const [drawModal, setDrawModal] = useState<DrawModalState>(emptyDrawModal);
  const [drawFormError, setDrawFormError] = useState<string | null>(null);

  const [attemptsModal, setAttemptsModal] = useState<AttemptsModalState>(emptyAttemptsModal);
  const [attemptsFormError, setAttemptsFormError] = useState<string | null>(null);

  const [pasteModal, setPasteModal] = useState<PasteAttemptsModalState>(emptyPasteModal);
  const [pasteFormError, setPasteFormError] = useState<string | null>(null);

  const [importModal, setImportModal] = useState<ImportModalState>(emptyImportModal);
  const [importFormError, setImportFormError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 2000 is the API's own hard cap (see `lotto_list`/`list_lotto_draws` in
      // the backend) — comfortably above the 1500+ historic draws currently
      // loaded, so nothing gets silently cut off further back than that.
      const r = await getLottoDraws(2000);
      setDraws(r.draws);
      setCollapsedIds(
        new Set(r.draws.filter((d) => d.attempts.length > 0).map((d) => d.draw.id)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lotto results");
      setDraws([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsertLocalDraw = (detail: LottoDrawDetail) => {
    setDraws((ds) => {
      const i = ds.findIndex((d) => d.draw.id === detail.draw.id);
      const out = i === -1 ? [detail, ...ds] : ds.map((d, idx) => (idx === i ? detail : d));
      return out.sort((a, b) => b.draw.draw_date.localeCompare(a.draw.draw_date));
    });
  };

  const openAddDraw = () => {
    setDrawFormError(null);
    setDrawModal({
      open: true,
      drawId: null,
      drawDate: "",
      numbersText: "",
      jackpotText: "",
      winnersText: "",
      isEdit: false,
    });
  };

  const openEditDraw = (detail: LottoDrawDetail) => {
    setDrawFormError(null);
    setDrawModal({
      open: true,
      drawId: detail.draw.id,
      drawDate: isoToUsDate(detail.draw.draw_date),
      numbersText: numbersToText(detail.draw.numbers),
      jackpotText:
        detail.draw.jackpot_prize != null ? String(detail.draw.jackpot_prize) : "",
      winnersText: String(detail.draw.winners),
      isEdit: true,
    });
  };

  const closeDrawModal = () => {
    setDrawModal(emptyDrawModal);
    setDrawFormError(null);
  };

  const submitDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawFormError(null);
    if (!drawModal.drawDate) {
      setDrawFormError("Enter a date.");
      return;
    }
    let drawDate: string;
    let numbers: number[] | null;
    let jackpotPrize: number | null;
    let winners: number;
    try {
      drawDate = parseDrawDate(drawModal.drawDate);
      numbers = parseOptionalNumbers(drawModal.numbersText);
      jackpotPrize = parseOptionalJackpot(drawModal.jackpotText);
      winners = parseWinners(drawModal.winnersText);
    } catch (err) {
      setDrawFormError(err instanceof Error ? err.message : "Invalid input");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const detail =
        drawModal.isEdit && drawModal.drawId != null
          ? await updateLottoDraw(drawModal.drawId, drawDate, numbers, jackpotPrize, winners)
          : await setLottoDraw(drawDate, numbers, jackpotPrize, winners);
      upsertLocalDraw(detail);
      closeDrawModal();
    } catch (err) {
      setDrawFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteDraw = async (drawId: number) => {
    if (!confirm("Delete this result and all its attempts?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteLottoDraw(drawId);
      setDraws((ds) => ds.filter((d) => d.draw.id !== drawId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const openAddAttempts = (drawId: number, ticket: number | null = null) => {
    setAttemptsFormError(null);
    setAttemptsModal({
      open: true,
      drawId,
      editingIds: [],
      attemptsText: "",
      ticketText: ticket != null ? String(ticket) : "",
      mode: "add",
    });
  };

  /** Opens the same modal pre-filled with every attempt on `items`, one per
   * line — submitting replaces the whole ticket's attempts with whatever's
   * parsed back out (see `submitAttemptsModal`). This is "edit a ticket":
   * add, remove, or change any of its board plays in one pass instead of
   * one attempt at a time. */
  const openEditTicket = (
    drawId: number,
    ticket: number,
    items: { attempt: LottoAttemptRow }[],
  ) => {
    setAttemptsFormError(null);
    setAttemptsModal({
      open: true,
      drawId,
      editingIds: items.map(({ attempt }) => attempt.id),
      attemptsText: items.map(({ attempt }) => numbersToText(attempt.numbers)).join("\n"),
      ticketText: String(ticket),
      mode: "edit",
    });
  };

  /** Opens the same modal for a single ungrouped attempt — the one case
   * where an attempt has no ticket to fold its edit into. */
  const openEditLooseAttempt = (drawId: number, attempt: LottoAttemptRow) => {
    setAttemptsFormError(null);
    setAttemptsModal({
      open: true,
      drawId,
      editingIds: [attempt.id],
      attemptsText: numbersToText(attempt.numbers),
      ticketText: "",
      mode: "edit",
    });
  };

  const closeAttemptsModal = () => {
    setAttemptsModal(emptyAttemptsModal);
    setAttemptsFormError(null);
  };

  /** Adds new attempts, or replaces an edited set — see `AttemptsModalState`.
   * A replace deletes every attempt in `editingIds` first and recreates the
   * parsed lines fresh, rather than diffing line-by-line against what was
   * there before — simpler, since there's no way to know which surviving
   * line "was" which old attempt once the line count changes. */
  const submitAttemptsModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptsFormError(null);
    if (attemptsModal.drawId == null) return;
    let numbersList: number[][];
    let ticket: number | null;
    try {
      numbersList = parseAttemptsLines(attemptsModal.attemptsText);
      ticket = parseOptionalTicket(attemptsModal.ticketText);
    } catch (err) {
      setAttemptsFormError(err instanceof Error ? err.message : "Invalid input");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let detail: LottoDrawDetail | null = null;
      for (const id of attemptsModal.editingIds) {
        detail = await deleteLottoAttempt(attemptsModal.drawId, id);
      }
      for (const numbers of numbersList) {
        detail = await createLottoAttempt(attemptsModal.drawId, numbers, ticket);
      }
      if (detail) upsertLocalDraw(detail);
      closeAttemptsModal();
    } catch (err) {
      setAttemptsFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteAttempt = async (drawId: number, attemptId: number) => {
    if (!confirm("Delete this attempt?")) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await deleteLottoAttempt(drawId, attemptId);
      upsertLocalDraw(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  /** Deletes every attempt on a ticket in one go — the ticket-level
   * counterpart to `onDeleteAttempt`. */
  const onDeleteTicket = async (drawId: number, items: { attempt: LottoAttemptRow }[]) => {
    if (
      !confirm(`Delete this ticket and its ${items.length} attempt${items.length === 1 ? "" : "s"}?`)
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let detail: LottoDrawDetail | null = null;
      for (const { attempt } of items) {
        detail = await deleteLottoAttempt(drawId, attempt.id);
      }
      if (detail) upsertLocalDraw(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const openPasteAttempts = () => {
    setPasteFormError(null);
    setPasteModal({ open: true, drawDate: "", attemptsText: "" });
  };

  const closePasteModal = () => {
    setPasteModal(emptyPasteModal);
    setPasteFormError(null);
  };

  const submitPasteAttempts = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasteFormError(null);
    if (!pasteModal.drawDate) {
      setPasteFormError("Enter a date.");
      return;
    }
    if (!pasteModal.attemptsText.trim()) {
      setPasteFormError("Paste in some numbers first.");
      return;
    }
    const drawDate = pasteModal.drawDate;
    let blocks: TicketBlock[];
    try {
      blocks = parseTicketsText(pasteModal.attemptsText);
    } catch (err) {
      setPasteFormError(err instanceof Error ? err.message : "Invalid input");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const existing = draws.find((d) => d.draw.draw_date === drawDate);
      let drawId: number;
      if (existing) {
        drawId = existing.draw.id;
      } else {
        const created = await setLottoDraw(drawDate, null);
        drawId = created.draw.id;
        upsertLocalDraw(created);
      }
      // Tickets without an explicit "ticket N" header are numbered after
      // whatever's already on this draw (so a second paste doesn't collide
      // with tickets from the first), in the order they're pasted.
      const priorMaxTicket = (existing?.attempts ?? []).reduce(
        (max, a) => (a.ticket != null && a.ticket > max ? a.ticket : max),
        0,
      );
      let nextAutoTicket = priorMaxTicket + 1;
      let detail: LottoDrawDetail | null = null;
      for (const block of blocks) {
        const ticket = block.ticket ?? nextAutoTicket;
        nextAutoTicket = Math.max(nextAutoTicket, ticket + 1);
        for (const numbers of block.attempts) {
          detail = await createLottoAttempt(drawId, numbers, ticket);
        }
      }
      if (detail) upsertLocalDraw(detail);
      closePasteModal();
    } catch (err) {
      setPasteFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** Downloads every draw that has a result as a pipe-delimited .txt file —
   * the same shape "Import historic results" reads, so this doubles as a
   * backup that can be re-imported later. Draws with no result yet aren't
   * included (see `drawToExportFields`). */
  const onExportHistoric = () => {
    const text = buildLottoExportText(draws);
    downloadTextFile(
      `lotto-results-${new Date().toISOString().slice(0, 10)}.txt`,
      text + (text ? "\n" : ""),
    );
  };

  /** Downloads every attempt logged across every draw, grouped by date. See
   * `buildAllAttemptsExportText` — this is a full backup/review file, not
   * something meant to be pasted back in as a whole. */
  const onExportAllAttempts = () => {
    const text = buildAllAttemptsExportText(draws);
    downloadTextFile(
      `lotto-attempts-${new Date().toISOString().slice(0, 10)}.txt`,
      text + (text ? "\n" : ""),
    );
  };

  const openImport = () => {
    setImportFormError(null);
    setImportSummary(null);
    setImportModal({ open: true, text: "" });
  };

  const closeImportModal = () => {
    setImportModal(emptyImportModal);
    setImportFormError(null);
    setImportSummary(null);
  };

  /** Bulk-loads historic results (date, numbers, jackpot, winners) from
   * pasted text via `POST /api/lotto/import-text` — each row is upserted by
   * date, so re-pasting backfills jackpot/winners onto draws that already
   * exist instead of duplicating them. */
  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportFormError(null);
    setImportSummary(null);
    if (!importModal.text.trim()) {
      setImportFormError("Paste in some rows first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await importLottoDrawResultsText(importModal.text);
      setImportSummary({
        inserted: result.inserted,
        updated: result.updated,
        total: result.total,
        errors: result.errors,
      });
      setImportModal((m) => ({ ...m, text: "" }));
      await load();
    } catch (err) {
      setImportFormError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  /** Renders one draw's full card: result balls, jackpot/winners, and its
   * attempts (grouped by ticket). Edit/Delete for the draw, a ticket, or an
   * ungrouped attempt aren't on the card face by default — double-click
   * that thing (see `revealedActions`) to reveal a pencil/trash icon pair
   * for it.
   *
   * `hero: true` is the "This draw" tab's spotlight treatment: bigger
   * balls, an eyebrow label, and the filter/sort controls
   * (`attemptFilter`/`attemptSort`) applied to its attempts. Every other
   * call site (History's expanded rows) passes no options and renders
   * exactly as before — filter/sort are a hero-only refinement, never
   * applied to a historic draw. */
  const renderDrawCard = (detail: LottoDrawDetail, opts: { hero?: boolean } = {}) => {
    const hero = opts.hero ?? false;
    const hasResult = detail.draw.numbers.length === 6;
    const drawSet = new Set(detail.draw.numbers);
    const totalAttempts = detail.attempts.length;
    const ticketCount = new Set(
      detail.attempts.flatMap((a) => (a.ticket != null ? [a.ticket] : [])),
    ).size;
    const hasAttempts = totalAttempts > 0;
    // The hero is always expanded — collapse only makes sense for History's
    // browsing use case.
    const collapsed = hero ? false : hasAttempts && collapsedIds.has(detail.draw.id);
    const collapsible = hasAttempts && !hero;
    const showDrawActions =
      revealedActions?.type === "draw" && revealedActions.drawId === detail.draw.id;
    // Without a result yet, there's nothing to match attempts against —
    // matchCount is a placeholder (-1) rather than a false "0/6 matched".
    // Order follows detail.attempts as logged (the sequence on the
    // physical tickets) — see bumpMatches below for how strong matches
    // surface without disturbing that order.
    const scoredAttempts = hasResult
      ? detail.attempts.map((attempt) => ({
          attempt,
          matchCount: attempt.numbers.filter((n) => drawSet.has(n)).length,
        }))
      : detail.attempts.map((attempt) => ({ attempt, matchCount: -1 }));
    // The filter chips are a "This draw"-only refinement — a historic card
    // always shows everything, exactly as before.
    const attemptsByMatch =
      hero && attemptFilter > 0
        ? scoredAttempts.filter(({ matchCount }) => matchCount >= attemptFilter)
        : scoredAttempts;
    // Always all six tiers, zero counts included, so the row of badges
    // lines up in the same place on every card instead of shifting
    // around based on which tiers that draw happened to hit — a summary
    // of the whole draw, not just what the hero's filter currently reveals.
    const matchBreakdown =
      hasResult && totalAttempts > 0
        ? [1, 2, 3, 4, 5, 6].map((tier) => ({
            tier,
            count: detail.attempts.filter(
              (a) => a.numbers.filter((n) => drawSet.has(n)).length === tier,
            ).length,
          }))
        : [];

    // Cluster attempts by ticket — up to a handful of board plays on
    // one physical ticket share a ticket number, so they're grouped
    // together instead of scattered across a flat list. Clusters keep
    // the order the tickets were logged in (that sequence is already
    // right) — bumpMatches only lifts a 3/6-or-better ticket to the top,
    // without otherwise reshuffling anything. Ungrouped attempts sit in
    // their own section underneath (edit one to give it a ticket number).
    type AttemptCluster = {
      ticket: number;
      items: typeof attemptsByMatch;
      bestMatch: number;
    };
    const byTicket = new Map<number, typeof attemptsByMatch>();
    const looseItems: typeof attemptsByMatch = [];
    for (const item of attemptsByMatch) {
      const ticket = item.attempt.ticket;
      if (ticket != null) {
        const arr = byTicket.get(ticket);
        if (arr) arr.push(item);
        else byTicket.set(ticket, [item]);
      } else {
        looseItems.push(item);
      }
    }
    const orderedLooseItems = bumpMatches(looseItems, (i) => i.matchCount >= 3);
    const ticketClusters: AttemptCluster[] = bumpMatches(
      Array.from(byTicket.entries()).map(([ticket, items]) => ({
        ticket,
        items,
        bestMatch: Math.max(...items.map((i) => i.matchCount)),
      })),
      (c) => c.bestMatch >= 3,
    );
    // "Best first" is the hero's read-only leaderboard view — every
    // attempt across every ticket, ranked by match count, no per-row
    // actions (switch back to "By ticket" for those).
    const rankedAttempts =
      hero && attemptSort === "best"
        ? [...attemptsByMatch].sort((a, b) => b.matchCount - a.matchCount)
        : null;

    const drawNumbersDisplay = hasResult ? (
      <div className="mt-2 flex flex-wrap justify-center gap-1 sm:gap-1.5">
        {detail.draw.numbers.map((n) => (
          <NumberBall key={n} n={n} variant="result" size={hero ? "lg" : "md"} />
        ))}
      </div>
    ) : (
      <span className="mt-2 inline-block rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
        Result not in yet
      </span>
    );
    const jackpotDisplay = (detail.draw.jackpot_prize != null || detail.draw.winners > 0) && (
      <p className="mt-1.5 text-xs text-ink-3">
        {detail.draw.jackpot_prize != null && (
          <>Jackpot {fmtAmountOrDash(detail.draw.jackpot_prize)}</>
        )}
        {detail.draw.jackpot_prize != null && detail.draw.winners > 0 && " · "}
        {detail.draw.winners > 0 && (
          <>
            {fmtCount(detail.draw.winners)} winner{detail.draw.winners === 1 ? "" : "s"}
          </>
        )}
      </p>
    );
    // A ticketed attempt is edited/deleted as part of its ticket
    // (double-click the ticket card) — only an ungrouped attempt gets its
    // own double-click, since there's no ticket to fold it into.
    const renderAttemptRow = (attempt: LottoAttemptRow) => {
      const showActions =
        attempt.ticket == null &&
        revealedActions?.type === "attempt" &&
        revealedActions.drawId === detail.draw.id &&
        revealedActions.attemptId === attempt.id;
      return (
      <li
        key={attempt.id}
        title={attempt.ticket == null ? "Double-click for edit/delete" : undefined}
        className="flex items-center gap-2 rounded-lg"
        onDoubleClick={
          attempt.ticket == null
            ? (e) => {
                e.stopPropagation();
                toggleRevealed({ type: "attempt", drawId: detail.draw.id, attemptId: attempt.id });
              }
            : undefined
        }
      >
        <div className="flex min-w-0 flex-1 gap-1.5">
          {attempt.numbers.map((n) => (
            <NumberChip
              key={n}
              n={n}
              variant={hasResult ? (drawSet.has(n) ? "match" : "miss") : "neutral"}
            />
          ))}
        </div>
        {showActions && (
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={saving}
              aria-label="Edit attempt"
              title="Edit attempt"
              className={ICON_BUTTON_CLASSES}
              onClick={() => openEditLooseAttempt(detail.draw.id, attempt)}
            >
              <PencilIcon className="size-5" />
            </button>
            <button
              type="button"
              disabled={saving}
              aria-label="Delete attempt"
              title="Delete attempt"
              className={ICON_BUTTON_CLASSES}
              onClick={() => void onDeleteAttempt(detail.draw.id, attempt.id)}
            >
              <TrashIcon className="size-5" />
            </button>
          </div>
        )}
      </li>
      );
    };
    const matchBreakdownDisplay = matchBreakdown.length > 0 && (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {matchBreakdown.map(({ tier, count }) => (
          <span
            key={tier}
            className={`rounded-full border border-line bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2 ${
              count === 0 ? "opacity-40" : ""
            }`}
          >
            {tier}/6 &times;{count}
          </span>
        ))}
      </div>
    );
    return (
      <section
        key={detail.draw.id}
        title="Double-click for edit/delete"
        className={
          hero
            ? "rounded-xl bg-surface p-5 shadow-xs sm:p-6"
            : CARD_CLASSES
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          toggleRevealed({ type: "draw", drawId: detail.draw.id });
        }}
      >
        <div
          className={`group -m-1 flex flex-wrap items-start justify-between gap-3 rounded-lg p-1 transition-colors duration-150 ${
            collapsible ? "cursor-pointer hover:bg-surface-2 dark:hover:bg-zinc-800/60" : ""
          }`}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
          onClick={() => {
            if (collapsible) toggleCollapsed(detail.draw.id);
          }}
          onKeyDown={(e) => {
            if (!collapsible) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleCollapsed(detail.draw.id);
            }
          }}
        >
          <div className="min-w-0">
            {hero && (
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  This draw
                </span>
                {hasResult && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                    result in
                  </span>
                )}
              </div>
            )}
            <h2
              className={`font-medium text-ink ${hero ? "text-2xl" : "text-lg"} ${
                collapsible
                  ? "transition-colors duration-150 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                  : ""
              }`}
            >
              {formatDate(detail.draw.draw_date)}
              {collapsed && (
                <span className="ml-2 text-sm font-normal text-ink-3">
                  ({totalAttempts} attempt
                  {totalAttempts === 1 ? "" : "s"}
                  {ticketCount > 0
                    ? `, ${ticketCount} ticket${ticketCount === 1 ? "" : "s"}`
                    : ""}
                  )
                </span>
              )}
            </h2>
            {drawNumbersDisplay}
            {jackpotDisplay}
            {matchBreakdownDisplay}
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5 sm:gap-2"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={saving}
              className={`${ADD_BUTTON_CLASSES} px-2 py-1.5 text-xs sm:px-3 sm:text-sm`}
              onClick={() => openAddAttempts(detail.draw.id)}
            >
              <span className="sm:hidden">+ Add</span>
              <span className="hidden sm:inline">+ Add attempt</span>
            </button>
            {showDrawActions && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Edit draw"
                  title="Edit draw"
                  className={ICON_BUTTON_CLASSES}
                  onClick={() => openEditDraw(detail)}
                >
                  <PencilIcon className="size-5" />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Delete draw"
                  title="Delete draw"
                  className={ICON_BUTTON_CLASSES}
                  onClick={() => void onDeleteDraw(detail.draw.id)}
                >
                  <TrashIcon className="size-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {hero && hasAttempts && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Seven options wrap where the (`inline-flex`, nowrap) segmented
             * wrapper token can't — same recipe, `flex flex-wrap` instead. */}
            <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1">
              {ATTEMPT_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`${SEGMENTED_BUTTON_CLASSES} ${
                    attemptFilter === f
                      ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                      : SEGMENTED_BUTTON_INACTIVE_CLASSES
                  }`}
                  onClick={() => setAttemptFilter(f)}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            <div className={SEGMENTED_WRAPPER_CLASSES}>
              {(Object.keys(SORT_LABELS) as AttemptSort[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${SEGMENTED_BUTTON_CLASSES} ${
                    attemptSort === s
                      ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                      : SEGMENTED_BUTTON_INACTIVE_CLASSES
                  }`}
                  onClick={() => setAttemptSort(s)}
                >
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {!collapsed && hasAttempts && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-medium text-ink-2">
              Attempts
            </h3>
            {ticketCount > 0 && (
              <span className="text-xs text-ink-3">
                {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {attemptsByMatch.length === 0 ? (
            <p className={`${DASHED_EMPTY_CLASSES} mt-3`}>
              No attempts match this filter.
            </p>
          ) : rankedAttempts ? (
            <ol className="mt-3 flex flex-col gap-2">
              {rankedAttempts.map(({ attempt, matchCount }, i) => (
                <li key={attempt.id} className="flex items-center gap-3 rounded-lg">
                  <span className="w-5 shrink-0 text-xs font-medium text-ink-4 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 gap-1.5">
                    {attempt.numbers.map((n) => (
                      <NumberChip
                        key={n}
                        n={n}
                        variant={hasResult ? (drawSet.has(n) ? "match" : "miss") : "neutral"}
                      />
                    ))}
                  </div>
                  {attempt.ticket != null && (
                    <span className="shrink-0 text-xs text-ink-3">ticket {attempt.ticket}</span>
                  )}
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold tabular-nums text-ink-2">
                    {hasResult ? `${matchCount}/6` : "—"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
          <div className="mt-3 flex flex-col gap-3">
            {ticketClusters.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
                {ticketClusters.map((cluster) => {
                  const showActions =
                    revealedActions?.type === "ticket" &&
                    revealedActions.drawId === detail.draw.id &&
                    revealedActions.ticket === cluster.ticket;
                  return (
                  <div
                    key={`ticket-${cluster.ticket}`}
                    title="Double-click for edit/delete"
                    className={`rounded-lg border p-3 transition-colors duration-150 ${
                      cluster.bestMatch >= 3
                        ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
                        : "border-line bg-surface-2/50"
                    }`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleRevealed({ type: "ticket", drawId: detail.draw.id, ticket: cluster.ticket });
                    }}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-3">
                      <span className="font-semibold text-ink-2">
                        Ticket {cluster.ticket}
                      </span>
                      <span>
                        {cluster.items.length} attempt{cluster.items.length === 1 ? "" : "s"}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {hasResult && (
                          <span
                            className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold ${
                              cluster.bestMatch >= 3
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "bg-surface-2 text-ink-2"
                            }`}
                          >
                            best {cluster.bestMatch}/6
                          </span>
                        )}
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          {showActions && (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                aria-label="Edit ticket"
                                title="Edit ticket"
                                className={ICON_BUTTON_CLASSES}
                                onClick={() => openEditTicket(detail.draw.id, cluster.ticket, cluster.items)}
                              >
                                <PencilIcon className="size-5" />
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                aria-label="Delete ticket"
                                title="Delete ticket"
                                className={ICON_BUTTON_CLASSES}
                                onClick={() => void onDeleteTicket(detail.draw.id, cluster.items)}
                              >
                                <TrashIcon className="size-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {cluster.items.map(({ attempt }) => renderAttemptRow(attempt))}
                    </ul>
                  </div>
                  );
                })}
              </div>
            )}
            {orderedLooseItems.length > 0 && (
              <div
                className={
                  ticketClusters.length > 0
                    ? "rounded-lg border border-dashed border-line-strong p-3"
                    : ""
                }
              >
                {ticketClusters.length > 0 && (
                  <div className="mb-2 text-xs font-medium text-ink-3">Ungrouped</div>
                )}
                <ul className="flex flex-col gap-2">
                  {orderedLooseItems.map(({ attempt }) => renderAttemptRow(attempt))}
                </ul>
              </div>
            )}
          </div>
          )}

          <button
            type="button"
            disabled={saving}
            className={`${ADD_BUTTON_CLASSES} mt-3 px-2 py-1 text-xs`}
            onClick={() => openAddAttempts(detail.draw.id)}
          >
            + Add attempt
          </button>
        </div>
        )}
      </section>
    );
  };

  /** History tab's compact one-line-per-draw row. Clicking it opens that
   * draw in a modal using the same hero treatment `renderDrawCard` gives
   * "This draw" (result balls, filter/sort, ticket grid) — nothing about
   * managing a historic draw is lost, it's just reached through a modal
   * instead of always open on the page. */
  const renderHistoryRow = (detail: LottoDrawDetail) => {
    const hasResult = detail.draw.numbers.length === 6;
    const totalAttempts = detail.attempts.length;
    const ticketCount = new Set(
      detail.attempts.flatMap((a) => (a.ticket != null ? [a.ticket] : [])),
    ).size;
    let bestMatch = -1;
    if (hasResult) {
      const drawSet = new Set(detail.draw.numbers);
      for (const a of detail.attempts) {
        const count = a.numbers.filter((n) => drawSet.has(n)).length;
        if (count > bestMatch) bestMatch = count;
      }
    }
    return (
      <button
        key={detail.draw.id}
        type="button"
        className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left transition-colors duration-150 hover:bg-surface-2 dark:hover:bg-zinc-800/60 sm:gap-4"
        onClick={() => setHistoryModalDrawId(detail.draw.id)}
      >
        <div className="w-28 shrink-0">
          <div className="text-sm font-medium text-ink">{formatDate(detail.draw.draw_date)}</div>
          {detail.draw.jackpot_prize != null && (
            <div className="text-xs tabular-nums text-ink-4">
              {fmtAmountOrDash(detail.draw.jackpot_prize)}
            </div>
          )}
        </div>
        {hasResult ? (
          <div className="flex flex-wrap gap-1">
            {detail.draw.numbers.map((n) => (
              <NumberBall key={n} n={n} variant="result" />
            ))}
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Result not in yet
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <span>
            {totalAttempts > 0
              ? `${fmtCount(totalAttempts)} attempt${totalAttempts === 1 ? "" : "s"}${
                  ticketCount > 0
                    ? ` · ${fmtCount(ticketCount)} ticket${ticketCount === 1 ? "" : "s"}`
                    : ""
                }`
              : "no attempts"}
          </span>
          {bestMatch >= 0 && (
            <span
              className={`rounded-full px-2 py-1 font-medium ${
                bestMatch >= 3
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-surface-2 text-ink-2"
              }`}
            >
              best {bestMatch}/6
            </span>
          )}
        </div>
      </button>
    );
  };

  const attemptsModalTitle =
    attemptsModal.mode === "add"
      ? "Add attempt(s)"
      : attemptsModal.editingIds.length > 1
        ? `Edit ticket ${attemptsModal.ticketText}`
        : "Edit attempt";

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <header>
        <PageHeader
          title="Lotto"
          description={
            <>
              Log each draw (6 numbers, 1–58), then log the attempts you played underneath
              it — matching numbers turn green.
            </>
          }
          actions={
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              aria-expanded={showDataTools}
              onClick={() => setShowDataTools((v) => !v)}
            >
              Data tools <span aria-hidden>{showDataTools ? "▴" : "▾"}</span>
            </button>
          }
        />

        {showDataTools && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={openAddDraw}
            >
              + Add result
            </button>
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={openImport}
              title="Bulk-load historic results (date, numbers, jackpot, winners) from pasted text"
            >
              Import historic results
            </button>
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={onExportHistoric}
              disabled={draws.every((d) => d.draw.numbers.length !== 6)}
              title="Download every draw with a result as a pipe-delimited text file, in the same format Import historic results reads"
            >
              Export historic results
            </button>
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={onExportAllAttempts}
              disabled={draws.every((d) => d.attempts.length === 0)}
              title="Download every attempt you've logged, across every draw, grouped by date"
            >
              Export all attempts
            </button>
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={openPasteAttempts}
            >
              Paste attempts
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && draws.length === 0 && (
        <p className={DASHED_EMPTY_CLASSES}>No results yet — add one to get started.</p>
      )}

      {!loading && draws.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`rounded-lg border p-4 ${STAT_TILE_TONES.emerald.card}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${STAT_TILE_TONES.emerald.label}`}>
                Best match ever
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${STAT_TILE_TONES.emerald.value}`}>
                  {overviewStats.bestMatch >= 0 ? `${overviewStats.bestMatch}/6` : "—"}
                </span>
                {overviewStats.bestMatchDate && (
                  <span className="text-sm text-ink-3">{formatDate(overviewStats.bestMatchDate)}</span>
                )}
              </div>
            </div>
            <div className={`rounded-lg border p-4 ${STAT_TILE_TONES.indigo.card}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${STAT_TILE_TONES.indigo.label}`}>
                Current jackpot
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${STAT_TILE_TONES.indigo.value}`}>
                  {overviewStats.currentJackpotDraw?.jackpot_prize != null
                    ? fmtJackpotCompact(overviewStats.currentJackpotDraw.jackpot_prize)
                    : "—"}
                </span>
                {overviewStats.currentJackpotDraw && (
                  <span className="text-sm text-ink-3">
                    {formatMonthDayShort(overviewStats.currentJackpotDraw.draw_date)} draw
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Only worth a card when there's actually something to say — an
           * empty "no coincidences" box on every visit is noise, not insight. */}
          {whatIfMatches.length > 0 && (
            <section className={CARD_CLASSES}>
              <h2 className="text-lg font-medium text-ink">What if?</h2>
              <p className="mt-1 text-sm text-ink-2">
                Numbers you&apos;ve played that exactly match a different draw&apos;s result
                somewhere else in the history — if only you&apos;d played them that day instead.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {whatIfMatches.map((w) => (
                  <li
                    key={w.key}
                    className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"
                  >
                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                      {w.numbers.map((n) => (
                        <NumberBall key={n} n={n} variant="match" />
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-2">
                      Attempt from {formatDate(w.loggedDrawDate)} matches the historic draw
                      result from{" "}
                      <span className="font-medium text-ink">
                        {formatDate(w.matchedDrawDate)}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={`${SEGMENTED_WRAPPER_CLASSES} self-start`}>
            {(Object.keys(TAB_LABELS) as LottoTab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`${SEGMENTED_BUTTON_CLASSES} ${
                  activeTab === t ? SEGMENTED_BUTTON_ACTIVE_CLASSES : SEGMENTED_BUTTON_INACTIVE_CLASSES
                }`}
                onClick={() => setActiveTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {activeTab === "draw" && pinnedDraw && renderDrawCard(pinnedDraw, { hero: true })}

          {activeTab === "history" && (
            <div className="flex flex-col gap-6">
              {collapsibleDraws.length > 0 && (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={`${ACTION_BUTTON_CLASSES} px-2 py-1.5 text-xs sm:px-3 sm:text-sm`}
                    onClick={toggleCollapseAll}
                  >
                    {allCollapsed ? "Expand all" : "Collapse all"}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-4">
                {yearGroups.map((group) => {
                  const expanded = expandedYears.has(group.year);
                  let bestOfYear = -1;
                  for (const d of group.items) {
                    if (d.draw.numbers.length !== 6) continue;
                    const s = new Set(d.draw.numbers);
                    for (const a of d.attempts) {
                      const c = a.numbers.filter((n) => s.has(n)).length;
                      if (c > bestOfYear) bestOfYear = c;
                    }
                  }
                  return (
                    <section key={group.year} className={CARD_CLASSES}>
                      <button
                        type="button"
                        className="-m-1 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors duration-150 hover:bg-surface-2 dark:hover:bg-zinc-800/60"
                        aria-expanded={expanded}
                        onClick={() => toggleYearExpanded(group.year)}
                      >
                        <div className="flex items-baseline gap-3">
                          <h2 className="text-lg font-medium text-ink">
                            {group.year}
                          </h2>
                          <span className="text-xs text-ink-3">
                            {fmtCount(group.items.length)} draw{group.items.length === 1 ? "" : "s"}
                            {bestOfYear >= 0 ? ` · best ${bestOfYear}/6` : ""}
                          </span>
                        </div>
                        <span
                          aria-hidden
                          className={`text-ink-4 transition-transform ${
                            expanded ? "rotate-90" : ""
                          }`}
                        >
                          ›
                        </span>
                      </button>
                      {expanded && (
                        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                          {group.items.map((detail) => renderHistoryRow(detail))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "insights" &&
            (() => {
              const ins = buildInsights(draws);
              const maxFavPlayed = Math.max(1, ...ins.favourites.map((f) => f.played));
              const maxFavDrawn = Math.max(1, ...ins.favourites.map((f) => f.drawn));
              return (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatTile
                      label="Average match"
                      value={ins.totalScored > 0 ? ins.avgMatch.toFixed(2) : "—"}
                      tone="indigo"
                    />
                    <StatTile
                      label="Hit rate ≥3"
                      value={ins.totalScored > 0 ? `${ins.hitRate3.toFixed(1)}%` : "—"}
                      tone="emerald"
                    />
                    <StatTile
                      label="Never drawn on me"
                      value={fmtCount(ins.neverDrawnCount)}
                      tone="amber"
                    />
                  </div>

                  <section className={CARD_CLASSES}>
                    <h2 className="text-sm font-semibold text-ink">Where my attempts land</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      Every scored attempt (against a draw with a result in), by match count.
                    </p>
                    {ins.totalScored === 0 ? (
                      <p className={`${DASHED_EMPTY_CLASSES} mt-3`}>
                        No scored attempts yet — this fills in once a draw&apos;s result is set.
                      </p>
                    ) : (
                      <div className="mt-4 flex flex-col gap-2">
                        {ins.histCounts.map((count, tier) => (
                          <div key={tier} className="flex items-center gap-3">
                            <span className="w-8 shrink-0 text-xs font-medium text-ink-3">
                              {tier}/6
                            </span>
                            <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className={`h-full rounded-full ${
                                  tier >= 3 ? "bg-emerald-500" : "bg-ink-4"
                                }`}
                                style={{
                                  width: `${Math.max(
                                    (count / ins.totalScored) * 100,
                                    count > 0 ? 2 : 0,
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="w-14 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">
                              {fmtCount(count)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className={CARD_CLASSES}>
                    <h2 className="text-sm font-semibold text-ink">My numbers vs the machine</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      How often you play a number, against how often it&apos;s been drawn.
                    </p>
                    {ins.favourites.length === 0 ? (
                      <p className={`${DASHED_EMPTY_CLASSES} mt-3`}>
                        Log some attempts to see this.
                      </p>
                    ) : (
                      <>
                        <div className="mt-4 flex flex-col gap-3">
                          {ins.favourites.map((f) => (
                            <div key={f.n} className="flex items-center gap-3">
                              <NumberBall n={f.n} variant={ins.latestDrawSet.has(f.n) ? "match" : "neutral"} />
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="h-2 rounded-full bg-surface-2">
                                  <div
                                    className="h-full rounded-full bg-ink-4"
                                    style={{ width: `${(f.played / maxFavPlayed) * 100}%` }}
                                  />
                                </div>
                                <div className="h-2 rounded-full bg-surface-2">
                                  <div
                                    className="h-full rounded-full bg-brand"
                                    style={{ width: `${(f.drawn / maxFavDrawn) * 100}%` }}
                                  />
                                </div>
                              </div>
                              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-3">
                                {fmtCount(f.played)}&times; / {fmtCount(f.drawn)}&times;
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink-3">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-3.5 rounded-full bg-ink-4" aria-hidden />
                            times you played it
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-3.5 rounded-full bg-brand" aria-hidden />
                            times it was drawn
                          </span>
                        </div>
                      </>
                    )}
                  </section>

                  <section className={CARD_CLASSES}>
                    <h2 className="text-sm font-semibold text-ink">Board coverage</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      Every number, 1–58, split into quarters by how often you&apos;ve played
                      it. Green numbers were in the most recent result.
                    </p>
                    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5">
                      {ins.board.map((c) => {
                        const swatch: BoardSwatch = ins.latestDrawSet.has(c.n)
                          ? "latest"
                          : c.tier;
                        return (
                          <div
                            key={c.n}
                            className={`flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors duration-150 ${BOARD_SWATCH_CLASSES[swatch]}`}
                            title={`Played ${c.played} time${c.played === 1 ? "" : "s"}${
                              swatch === "latest" ? " · in the latest result" : ""
                            }`}
                          >
                            {String(c.n).padStart(2, "0")}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
                      {BOARD_LEGEND.map((swatch) => (
                        <span key={swatch} className="flex items-center gap-1.5">
                          <span
                            className={`h-4 w-4 shrink-0 rounded ${BOARD_SWATCH_CLASSES[swatch]}`}
                            aria-hidden
                          />
                          {BOARD_SWATCH_LABELS[swatch]}
                        </span>
                      ))}
                    </div>
                  </section>
                </div>
              );
            })()}
        </>
      )}

      <Modal open={drawModal.open} onClose={closeDrawModal} ariaLabelledBy="lotto-draw-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="lotto-draw-title" className="text-lg font-semibold text-ink">
            {drawModal.isEdit ? "Edit result" : "Add result"}
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closeDrawModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitDraw} className="flex flex-col gap-4">
          {drawFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {drawFormError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Draw date</span>
            <input
              required
              type="text"
              className={INPUT_CLASSES}
              value={drawModal.drawDate}
              disabled={saving}
              onChange={(e) => setDrawModal((m) => ({ ...m, drawDate: e.target.value }))}
            />
            <span className="text-xs text-ink-3">{DRAW_DATE_HELP}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">
              Winning numbers <span className="font-normal text-ink-4">(optional)</span>
            </span>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={drawModal.numbersText}
              disabled={saving}
              onChange={(e) => setDrawModal((m) => ({ ...m, numbersText: e.target.value }))}
            />
            <span className="text-xs text-ink-3">
              {NUMBERS_HELP} — leave blank if the draw hasn&apos;t happened yet; fill it in
              once the result is announced.
            </span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-ink-2">
                Jackpot prize <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <AmountInput
                value={drawModal.jackpotText}
                disabled={saving}
                onChange={(v) => setDrawModal((m) => ({ ...m, jackpotText: v }))}
              />
            </label>
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-ink-2">
                Winners <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                className={INPUT_CLASSES}
                value={drawModal.winnersText}
                disabled={saving}
                onChange={(e) => setDrawModal((m) => ({ ...m, winnersText: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : drawModal.isEdit ? "Update" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeDrawModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={attemptsModal.open} onClose={closeAttemptsModal} ariaLabelledBy="lotto-attempts-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="lotto-attempts-title" className="text-lg font-semibold text-ink">
            {attemptsModalTitle}
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closeAttemptsModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitAttemptsModal} className="flex flex-col gap-4">
          {attemptsFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {attemptsFormError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Your numbers</span>
            <textarea
              required
              rows={attemptsModal.editingIds.length > 1 ? 6 : 3}
              className={`${INPUT_CLASSES} font-mono`}
              placeholder={"03 12 19 27 41 58\n01 02 34 37 52 57"}
              value={attemptsModal.attemptsText}
              disabled={saving}
              onChange={(e) =>
                setAttemptsModal((m) => ({ ...m, attemptsText: e.target.value }))
              }
            />
            <span className="text-xs text-ink-3">
              One attempt per line, {NUMBERS_HELP} — add more lines for more attempts on the
              same ticket.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">
              Ticket # <span className="font-normal text-ink-4">(optional)</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              className={INPUT_CLASSES}
              value={attemptsModal.ticketText}
              disabled={saving}
              onChange={(e) => setAttemptsModal((m) => ({ ...m, ticketText: e.target.value }))}
            />
            <span className="text-xs text-ink-3">
              Groups every line above onto the same physical ticket, so they cluster
              together — leave blank if they aren&apos;t part of a ticket.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : attemptsModal.mode === "edit" ? "Save changes" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeAttemptsModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={pasteModal.open} onClose={closePasteModal} ariaLabelledBy="lotto-paste-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="lotto-paste-title" className="text-lg font-semibold text-ink">
            Paste attempts
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closePasteModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitPasteAttempts} className="flex flex-col gap-4">
          {pasteFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {pasteFormError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Draw date</span>
            <input
              required
              type="date"
              className={INPUT_CLASSES}
              value={pasteModal.drawDate}
              disabled={saving}
              onChange={(e) => setPasteModal((m) => ({ ...m, drawDate: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Attempts</span>
            <textarea
              required
              rows={10}
              className={`${INPUT_CLASSES} font-mono`}
              placeholder={"01 02 34 37 52 57\n\nTicket 2\n03 12 19 27 41 58"}
              value={pasteModal.attemptsText}
              disabled={saving}
              onChange={(e) =>
                setPasteModal((m) => ({ ...m, attemptsText: e.target.value }))
              }
            />
            <span className="text-xs text-ink-3">
              6 numbers per line (e.g. &quot;01 02 34 37 52 57&quot;) — a blank line starts a
              new ticket, so each group of lines becomes one ticket&apos;s attempts against
              the draw date above. A group&apos;s first line may optionally read
              &quot;ticket N&quot; to pin its number; otherwise tickets are numbered in the
              order they&apos;re pasted.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : "Add attempts"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closePasteModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importModal.open}
        onClose={closeImportModal}
        ariaLabelledBy="lotto-import-title"
        dialogClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="lotto-import-title" className="text-lg font-semibold text-ink">
            Import historic results
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closeImportModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitImport} className="flex flex-col gap-4">
          {importFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {importFormError}
            </div>
          )}
          {importSummary && (
            <div className={alertClasses("success")}>
              Imported {fmtCount(importSummary.total)} row
              {importSummary.total === 1 ? "" : "s"}: {fmtCount(importSummary.inserted)} added,{" "}
              {fmtCount(importSummary.updated)} updated.
              {importSummary.errors.length > 0 && (
                <div className="mt-2 text-amber-700 dark:text-amber-300">
                  {importSummary.errors.length} line
                  {importSummary.errors.length === 1 ? "" : "s"} couldn&apos;t be parsed:
                  <ul className="mt-1 list-disc pl-5">
                    {importSummary.errors.slice(0, 10).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                  {importSummary.errors.length > 10 && (
                    <div className="mt-1">…and {importSummary.errors.length - 10} more.</div>
                  )}
                </div>
              )}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Results</span>
            <textarea
              required
              rows={14}
              wrap="off"
              className={`${INPUT_CLASSES} font-mono whitespace-pre overflow-x-auto`}
              value={importModal.text}
              disabled={saving}
              onChange={(e) => setImportModal((m) => ({ ...m, text: e.target.value }))}
            />
            <span className="text-xs text-ink-3">
              One draw per line: <code>| n1-n2-n3-n4-n5-n6 | m/d/yyyy | jackpot | winners |</code>.
              A leading game-name column (e.g. pasted straight from a spreadsheet, tab-separated)
              is fine too — it&apos;s discarded on import. Each row is upserted by date, so
              re-pasting (e.g. to backfill jackpot/winners on draws already here) overwrites
              rather than duplicating.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeImportModal}
            >
              {importSummary ? "Done" : "Cancel"}
            </button>
          </div>
        </form>
      </Modal>

      {/* History tab: a draw's compact row opens here, in the same hero
       * treatment "This draw" gives its pinned draw. */}
      {historyModalDrawId != null &&
        (() => {
          const detail = draws.find((d) => d.draw.id === historyModalDrawId);
          if (!detail) return null;
          return (
            <Modal
              open
              onClose={() => setHistoryModalDrawId(null)}
              ariaLabelledBy="lotto-history-draw-title"
              dialogClassName="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop sm:p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <h2 id="lotto-history-draw-title" className="sr-only">
                  {formatDate(detail.draw.draw_date)}
                </h2>
                <button
                  type="button"
                  className={`${CLOSE_BUTTON_CLASSES} ml-auto`}
                  onClick={() => setHistoryModalDrawId(null)}
                >
                  Close
                </button>
              </div>
              {renderDrawCard(detail, { hero: true })}
            </Modal>
          );
        })()}
    </div>
  );
}
