"use client";

import Link from "next/link";
import { AmountInput } from "@/components/AmountInput";
import { ChevronRightIcon, PencilIcon, TrashIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  createLottoAttempt,
  createLottoAttemptsBulk,
  deleteLottoAttempt,
  deleteLottoDraw,
  getLottoDraws,
  getLottoGames,
  importLottoDrawResultsText,
  setLottoDraw,
  updateLottoDraw,
  type LottoAttemptRow,
  type LottoDrawDetail,
} from "@/lib/api";
import {
  MONTH_NAMES_FULL,
  formatDate,
  formatMonthDayShort,
  parseDateOnlyLocal,
} from "@/lib/dateFormat";
import { fmtCount, fmtJackpotCompact } from "@/lib/formatNumber";
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
  /** "lg" is ~2x the "md" ball — used for a draw card's own result, where
   * it's the single most important thing on the page. */
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
      ? "h-12 w-12 text-lg sm:h-16 sm:w-16 sm:text-2xl"
      : "h-7 w-7 text-xs sm:h-9 sm:w-9 sm:text-sm";
  return (
    <span
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums ${styles[variant]}`}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** The attempt that matched the most of a draw's result: how many it hit
 * (-1 when the draw has no result or no attempts) and which result numbers
 * those were, so History can light them up on the draw's own balls. */
function bestAttempt(detail: LottoDrawDetail): { count: number; hits: Set<number> } {
  let best = { count: -1, hits: new Set<number>() };
  if (detail.draw.numbers.length !== 6) return best;
  const drawSet = new Set(detail.draw.numbers);
  for (const a of detail.attempts) {
    const hits = new Set(a.numbers.filter((n) => drawSet.has(n)));
    if (hits.size > best.count) best = { count: hits.size, hits };
  }
  return best;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** One attempt line's own score, at the end of its row — tinted once it
 * reaches a prize tier, the same threshold `MatchPill` uses. */
function ScoreCell({ count }: { count: number }) {
  return (
    <span
      className={`flex h-9 w-11 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums ${
        count >= 3
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "text-ink-4"
      }`}
    >
      {count}/6
    </span>
  );
}

/** "Best 4/6" pill, tinted by prize tier — 3+ is where PCSO starts paying,
 * 6 is the jackpot. */
function MatchPill({ count }: { count: number }) {
  const tone =
    count === 6
      ? "bg-amber-400 text-amber-950"
      : count >= 3
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
        : "bg-surface-2 text-ink-2";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tone}`}>
      {count === 6 ? "Jackpot!" : `Best ${count}/6`}
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
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TILE_TONES;
  /** One plain-language line saying what the number means. */
  hint?: string;
}) {
  const t = STAT_TILE_TONES[tone];
  return (
    <div className={`rounded-lg border p-4 ${t.card}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${t.label}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${t.value}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
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

/** A legend entry: a frequency band, or `latest` — a ring drawn *on top of*
 * a cell's band when the number came up in the most recent result, so
 * spotting "this just got drawn" doesn't hide how often you play it. */
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
  latest: "ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface",
};

const BOARD_SWATCH_LABELS: Record<BoardSwatch, string> = {
  never: "Never",
  least: "Rarely",
  secondLeast: "Sometimes",
  sometimes: "Often",
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

/** `maxNumber` is the game's field size (45 for 6/45), so the board only
 * shows numbers the game can actually draw. */
function buildInsights(draws: LottoDrawDetail[], maxNumber: number): InsightsData {
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
  const counts = Array.from({ length: maxNumber }, (_, i) => played.get(i + 1) ?? 0);
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

export default function LottoClient({ gameId }: { gameId: number }) {
  const [gameName, setGameName] = useState<string | null>(null);
  const [draws, setDraws] = useState<LottoDrawDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import/export/paste are bulk data-management actions, not the thing
  // most visits to this page are for — tucked behind one toggle instead of
  // four buttons competing with the page's actual content for attention.
  const [showDataTools, setShowDataTools] = useState(false);

  const [activeTab, setActiveTab] = useState<LottoTab>("draw");

  // Refine a draw card's attempt list: `attemptFilter` is an exact match
  // count picked from the card's tally strip (null = every attempt).
  const [attemptFilter, setAttemptFilter] = useState<number | null>(null);
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

  // History tab shows one compact row per draw; clicking one opens it in a
  // modal using the same card as "This draw" (result balls, tally strip,
  // ticket grid) rather than navigating away.
  const [historyModalDrawId, setHistoryModalDrawId] = useState<number | null>(null);

  // Draws are grouped into one card per year so a history spanning many
  // years doesn't render as one endless flat list; the newest year opens on
  // load (see `load`), the rest expand on click.
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  // Most of a game's ~1,500 draws were never played — "Played" cuts History
  // down to the ones with attempts logged.
  const [historyFilter, setHistoryFilter] = useState<"all" | "played">("all");

  const toggleYearExpanded = (year: string) => {
    setExpandedYears((s) => {
      const next = new Set(s);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  // The field size is the name's "6/NN" suffix, so the board and copy say
  // 1–45 on Megalotto rather than the 1–58 of the biggest game.
  const maxNumber = Number(gameName?.match(/\/(\d+)$/)?.[1]) || 58;

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

  const playedDraws = draws.filter((d) => d.attempts.length > 0);
  const historyDraws = historyFilter === "played" ? playedDraws : draws;

  // `draws` is already sorted newest-first, so same-year and same-month draws
  // are always contiguous — one pass buckets them into ordered year → month
  // groups for the History tab, tallying each year's summary on the way.
  const yearGroups: {
    year: string;
    months: { month: number; items: LottoDrawDetail[] }[];
    count: number;
    played: number;
    best: number;
  }[] = [];
  for (const detail of historyDraws) {
    const year = detail.draw.draw_date.slice(0, 4);
    const month = Number(detail.draw.draw_date.slice(5, 7));
    let group = yearGroups[yearGroups.length - 1];
    if (!group || group.year !== year) {
      group = { year, months: [], count: 0, played: 0, best: -1 };
      yearGroups.push(group);
    }
    let monthGroup = group.months[group.months.length - 1];
    if (!monthGroup || monthGroup.month !== month) {
      monthGroup = { month, items: [] };
      group.months.push(monthGroup);
    }
    monthGroup.items.push(detail);
    group.count += 1;
    if (detail.attempts.length > 0) group.played += 1;
    group.best = Math.max(group.best, bestAttempt(detail).count);
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
      const r = await getLottoDraws(gameId, 2000);
      setDraws(r.draws);
      // Open the newest year the first time there's anything to show; later
      // reloads (after a save) leave whatever the user has open alone.
      setExpandedYears((s) =>
        s.size > 0 || r.draws.length === 0 ? s : new Set([r.draws[0].draw.draw_date.slice(0, 4)]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lotto results");
      setDraws([]);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getLottoGames()
      .then((r) => setGameName(r.games.find((g) => g.id === gameId)?.name ?? null))
      .catch(() => setGameName(null));
  }, [gameId]);

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
          ? await updateLottoDraw(gameId, drawModal.drawId, drawDate, numbers, jackpotPrize, winners)
          : await setLottoDraw(gameId, drawDate, numbers, jackpotPrize, winners);
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

  const openAddAttempts = (drawId: number) => {
    setAttemptsFormError(null);
    setAttemptsModal({
      open: true,
      drawId,
      editingIds: [],
      attemptsText: "",
      ticketText: "",
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

  /** Creates every attempt in `blocks` against `drawId` in one request. A
   * block with no explicit "Ticket N" header is numbered after whatever's
   * already on the draw, so a second add (or paste) doesn't collide with
   * tickets from the first. Returns null if the blocks were empty. Shared by
   * "Add attempt" and "Paste attempts" so both number tickets identically —
   * and, since a paste can carry a few dozen board plays, both save in one
   * round trip instead of one ``POST .../attempts`` per line (same fix as
   * "Import historic results"' bulk upsert). */
  const createTicketBlocks = async (
    drawId: number,
    blocks: TicketBlock[],
    existingAttempts: LottoAttemptRow[],
  ): Promise<LottoDrawDetail | null> => {
    const priorMaxTicket = existingAttempts.reduce(
      (max, a) => (a.ticket != null && a.ticket > max ? a.ticket : max),
      0,
    );
    let nextAutoTicket = priorMaxTicket + 1;
    const attempts: { numbers: number[]; ticket: number }[] = [];
    for (const block of blocks) {
      const ticket = block.ticket ?? nextAutoTicket;
      nextAutoTicket = Math.max(nextAutoTicket, ticket + 1);
      for (const numbers of block.attempts) {
        attempts.push({ numbers, ticket });
      }
    }
    if (attempts.length === 0) return null;
    return createLottoAttemptsBulk(drawId, attempts);
  };

  /** Adds new attempts, or replaces an edited set — see `AttemptsModalState`.
   *
   * Adding reads the same ticket-block grammar "Paste attempts" does — a
   * blank line starts a new ticket — so several tickets can go onto a draw
   * in one pass, numbered automatically. (The parser still honors an
   * explicit "Ticket N" header, which is what makes pasted export text
   * round-trip, but the add form doesn't ask anyone to write one.)
   *
   * Editing stays single-ticket: it's replacing *this* ticket's board plays
   * (or one ungrouped attempt), so it deletes every attempt in `editingIds`
   * and recreates the parsed lines fresh rather than diffing line-by-line —
   * there's no way to know which surviving line "was" which old attempt
   * once the line count changes. */
  const submitAttemptsModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptsFormError(null);
    const drawId = attemptsModal.drawId;
    if (drawId == null) return;

    if (attemptsModal.mode === "add") {
      let blocks: TicketBlock[];
      try {
        blocks = parseTicketsText(attemptsModal.attemptsText);
      } catch (err) {
        setAttemptsFormError(err instanceof Error ? err.message : "Invalid input");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const existing = draws.find((d) => d.draw.id === drawId);
        const detail = await createTicketBlocks(drawId, blocks, existing?.attempts ?? []);
        if (detail) upsertLocalDraw(detail);
        closeAttemptsModal();
      } catch (err) {
        setAttemptsFormError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
      return;
    }

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
        detail = await deleteLottoAttempt(drawId, id);
      }
      for (const numbers of numbersList) {
        detail = await createLottoAttempt(drawId, numbers, ticket);
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
        const created = await setLottoDraw(gameId, drawDate, null);
        drawId = created.draw.id;
        upsertLocalDraw(created);
      }
      const detail = await createTicketBlocks(drawId, blocks, existing?.attempts ?? []);
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
      const result = await importLottoDrawResultsText(gameId, importModal.text);
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
   * Used for "This draw" and for a History row's modal alike, with the
   * tally strip (`attemptFilter`) and sort (`attemptSort`) applied to its
   * attempts. */
  const renderDrawCard = (detail: LottoDrawDetail) => {
    const hasResult = detail.draw.numbers.length === 6;
    const drawSet = new Set(detail.draw.numbers);
    const drawDate = parseDateOnlyLocal(detail.draw.draw_date);
    const totalAttempts = detail.attempts.length;
    const ticketCount = new Set(
      detail.attempts.flatMap((a) => (a.ticket != null ? [a.ticket] : [])),
    ).size;
    const hasAttempts = totalAttempts > 0;
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
    // The tally strip doubles as the filter: picking a tier shows only the
    // lines that hit exactly that many. Without a result there's nothing to
    // filter by, so a leftover pick from another draw is ignored.
    const activeFilter = hasResult ? attemptFilter : null;
    const attemptsByMatch =
      activeFilter != null
        ? scoredAttempts.filter(({ matchCount }) => matchCount === activeFilter)
        : scoredAttempts;
    // All seven tiers, zero counts included, so the strip keeps the same
    // shape on every draw — a summary of the whole draw, not of whatever
    // the filter currently shows.
    const matchBreakdown =
      hasResult && hasAttempts
        ? [0, 1, 2, 3, 4, 5, 6].map((tier) => ({
            tier,
            count: scoredAttempts.filter((s) => s.matchCount === tier).length,
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
    // "Best first" is a read-only leaderboard — every attempt across every
    // ticket, ranked by match count, no per-row actions (switch back to
    // "By ticket" for those). Meaningless before the result is in.
    const rankedAttempts =
      hasResult && attemptSort === "best"
        ? [...attemptsByMatch].sort((a, b) => b.matchCount - a.matchCount)
        : null;

    // Six dashed placeholders stand in for a result that isn't in yet, so
    // the card keeps its shape either way.
    const drawNumbersDisplay = (
      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3">
        {hasResult
          ? detail.draw.numbers.map((n) => <NumberBall key={n} n={n} variant="result" size="lg" />)
          : Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className="h-12 w-12 shrink-0 rounded-full border-2 border-dashed border-line-strong sm:h-16 sm:w-16"
              />
            ))}
      </div>
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
        {hasResult && <ScoreCell count={attempt.numbers.filter((n) => drawSet.has(n)).length} />}
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
    return (
      <section
        key={detail.draw.id}
        title="Double-click for edit/delete"
        className={CARD_CLASSES}
        onDoubleClick={(e) => {
          e.stopPropagation();
          toggleRevealed({ type: "draw", drawId: detail.draw.id });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {hasResult ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Result in
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                Awaiting result
              </span>
            )}
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {drawDate ? LONG_DATE_FORMAT.format(drawDate) : formatDate(detail.draw.draw_date)}
            </h2>
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

        {drawNumbersDisplay}

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:flex sm:gap-10">
          <div>
            <dt className="text-xs text-ink-3">Jackpot</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {detail.draw.jackpot_prize != null ? fmtJackpotCompact(detail.draw.jackpot_prize) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Winners</dt>
            <dd
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                detail.draw.winners > 0 ? "text-amber-700 dark:text-amber-300" : "text-ink"
              }`}
            >
              {!hasResult ? "—" : detail.draw.winners > 0 ? fmtCount(detail.draw.winners) : "None"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Your attempts</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {fmtCount(totalAttempts)}
              {ticketCount > 0 && (
                <span className="ml-1.5 text-sm font-normal text-ink-3">
                  on {fmtCount(ticketCount)} ticket{ticketCount === 1 ? "" : "s"}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {!hasAttempts && (
          <p className={`${DASHED_EMPTY_CLASSES} mt-5`}>
            No attempts on this draw yet — add the numbers you played to check them against the result.
          </p>
        )}

        {hasAttempts && (
        <div className="mt-5 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">How your attempts did</h3>
              <p className="mt-0.5 text-xs text-ink-3">
                {hasResult
                  ? "Tap a count to show only those attempts."
                  : "Each attempt gets scored once the result is in."}{" "}
                Double-click a ticket to edit or delete it.
              </p>
            </div>
            {hasResult && (
              <div className={SEGMENTED_WRAPPER_CLASSES}>
                {(Object.keys(SORT_LABELS) as AttemptSort[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={attemptSort === s}
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
            )}
          </div>

          {/* The tally doubles as the filter: one tap narrows the list to
              that match count, a second tap (or "Show all") clears it. */}
          {matchBreakdown.length > 0 && (
            <div className="mb-2 mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
              {matchBreakdown.map(({ tier, count }) => {
                const active = activeFilter === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    disabled={count === 0}
                    aria-pressed={active}
                    aria-label={`${count} attempt${count === 1 ? "" : "s"} matched ${tier} of 6`}
                    className={`rounded-lg border px-1 py-2 text-center transition-colors duration-150 disabled:cursor-default disabled:opacity-40 ${
                      active
                        ? "border-brand bg-surface ring-1 ring-brand"
                        : tier >= 3 && count > 0
                          ? "border-emerald-300 bg-emerald-50 hover:border-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/40"
                          : "border-transparent bg-surface-2 enabled:hover:border-line-strong"
                    }`}
                    onClick={() => setAttemptFilter(active ? null : tier)}
                  >
                    <div className="text-lg font-semibold leading-tight tabular-nums text-ink sm:text-xl">
                      {fmtCount(count)}
                    </div>
                    <div className="text-[11px] font-medium text-ink-3">{tier}/6</div>
                  </button>
                );
              })}
            </div>
          )}
          {activeFilter != null && (
            <p className="mt-2 text-xs text-ink-3">
              Showing only attempts that matched {activeFilter}/6 ·{" "}
              <button
                type="button"
                className="font-medium text-brand-text hover:underline"
                onClick={() => setAttemptFilter(null)}
              >
                Show all
              </button>
            </p>
          )}

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
                    <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">
                      Ticket {attempt.ticket}
                    </span>
                  )}
                  <ScoreCell count={matchCount} />
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
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Ticket {cluster.ticket}</span>
                      <span className="text-xs text-ink-3">
                        {cluster.items.length} attempt{cluster.items.length === 1 ? "" : "s"}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {hasResult && <MatchPill count={cluster.bestMatch} />}
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
            className="mt-4 w-full rounded-lg border border-dashed border-line-strong py-2.5 text-sm font-medium text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand-text disabled:opacity-50"
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
    const { draw, attempts } = detail;
    const hasResult = draw.numbers.length === 6;
    const date = parseDateOnlyLocal(draw.draw_date);
    const ticketCount = new Set(attempts.flatMap((a) => (a.ticket != null ? [a.ticket] : []))).size;
    const best = bestAttempt(detail);
    return (
      <li key={draw.id}>
        <button
          type="button"
          aria-label={`${formatDate(draw.draw_date)} draw`}
          className="group flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2 sm:flex-nowrap sm:gap-x-5 sm:px-3"
          onClick={() => setHistoryModalDrawId(draw.id)}
        >
          {/* Calendar-style date: the month is already in the group header. */}
          <div className="w-9 shrink-0 text-center">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-4">
              {date ? WEEKDAY_FORMAT.format(date) : ""}
            </div>
            <div className="text-lg font-semibold leading-tight tabular-nums text-ink">
              {date?.getDate()}
            </div>
          </div>

          {/* The result, with the numbers your best line hit filled in green. */}
          <div className="flex gap-1 sm:gap-1.5">
            {hasResult
              ? draw.numbers.map((n) => (
                  <NumberBall key={n} n={n} variant={best.hits.has(n) ? "match" : "result"} />
                ))
              : Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className="h-7 w-7 shrink-0 rounded-full border border-dashed border-line-strong sm:h-9 sm:w-9"
                  />
                ))}
          </div>

          {/* Fixed width right after the balls, so it lines up on every row
              whatever the play summary beside it says. */}
          <div className="hidden w-28 shrink-0 md:block">
            <div className="text-sm font-medium tabular-nums text-ink-2">
              {draw.jackpot_prize != null ? fmtJackpotCompact(draw.jackpot_prize) : "—"}
            </div>
            <div
              className={`text-xs ${
                hasResult && draw.winners > 0
                  ? "font-medium text-amber-700 dark:text-amber-300"
                  : "text-ink-4"
              }`}
            >
              {!hasResult
                ? "Awaiting result"
                : draw.winners > 0
                  ? `Won by ${fmtCount(draw.winners)}`
                  : "No winner"}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-5">
            <div className="flex flex-col items-end gap-1">
              {attempts.length > 0 &&
                (best.count >= 0 ? (
                  <MatchPill count={best.count} />
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
                    Played
                  </span>
                ))}
              {attempts.length > 0 && (
                <span className="hidden text-xs tabular-nums text-ink-4 sm:block">
                  {fmtCount(attempts.length)} attempt{attempts.length === 1 ? "" : "s"}
                  {ticketCount > 0
                    ? ` · ${fmtCount(ticketCount)} ticket${ticketCount === 1 ? "" : "s"}`
                    : ""}
                </span>
              )}
            </div>

            <ChevronRightIcon className="hidden size-4 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text sm:block" />
          </div>
        </button>
      </li>
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
          title={gameName ?? "Lotto"}
          description={
            <>
              <Link href="/lotto" className="text-brand-text hover:underline">
                ← All games
              </Link>{" "}
              — log each draw (6 numbers, 1–{maxNumber}), then log the attempts you played underneath
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

          {activeTab === "draw" && pinnedDraw && renderDrawCard(pinnedDraw)}

          {activeTab === "history" && (
            <div className="flex flex-col gap-4">
              <div className={`${SEGMENTED_WRAPPER_CLASSES} self-start`}>
                {(
                  [
                    ["all", "All draws", draws.length],
                    ["played", "Played", playedDraws.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={historyFilter === value}
                    className={`${SEGMENTED_BUTTON_CLASSES} ${
                      historyFilter === value
                        ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                        : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setHistoryFilter(value)}
                  >
                    {label} <span className="tabular-nums opacity-70">{fmtCount(count)}</span>
                  </button>
                ))}
              </div>

              {yearGroups.length === 0 && (
                <p className={DASHED_EMPTY_CLASSES}>
                  No played draws yet — log attempts on a draw and it shows up here.
                </p>
              )}

              {yearGroups.map((group) => {
                const expanded = expandedYears.has(group.year);
                return (
                  <section
                    key={group.year}
                    className="rounded-xl border border-line bg-surface p-2 shadow-xs sm:p-3"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2 sm:px-3"
                      aria-expanded={expanded}
                      onClick={() => toggleYearExpanded(group.year)}
                    >
                      <h2 className="text-lg font-semibold tabular-nums text-ink">{group.year}</h2>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                        <span>
                          {fmtCount(group.count)} draw{group.count === 1 ? "" : "s"}
                        </span>
                        {historyFilter === "all" && group.played > 0 && (
                          <span>· {fmtCount(group.played)} played</span>
                        )}
                      </span>
                      <span className="ml-auto flex items-center gap-3">
                        {group.best >= 0 && <MatchPill count={group.best} />}
                        <ChevronRightIcon
                          aria-hidden
                          className={`size-4 text-ink-4 transition-transform duration-150 ${
                            expanded ? "rotate-90" : ""
                          }`}
                        />
                      </span>
                    </button>
                    {expanded &&
                      group.months.map(({ month, items }) => (
                        <div key={month} className="mt-2 border-t border-line pt-2">
                          <h3 className="flex items-baseline gap-2 px-2 pb-1 pt-1 sm:px-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                              {MONTH_NAMES_FULL[month - 1]}
                            </span>
                            <span className="text-xs text-ink-4">
                              {fmtCount(items.length)} draw{items.length === 1 ? "" : "s"}
                            </span>
                          </h3>
                          <ul className="flex flex-col">{items.map(renderHistoryRow)}</ul>
                        </div>
                      ))}
                  </section>
                );
              })}
            </div>
          )}

          {activeTab === "insights" &&
            (() => {
              const ins = buildInsights(draws, maxNumber);
              const maxFavPlayed = Math.max(1, ...ins.favourites.map((f) => f.played));
              const maxFavDrawn = Math.max(1, ...ins.favourites.map((f) => f.drawn));
              const maxHist = Math.max(1, ...ins.histCounts);
              return (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatTile
                      label="Average match"
                      value={ins.totalScored > 0 ? `${ins.avgMatch.toFixed(2)} / 6` : "—"}
                      tone="indigo"
                      hint="Numbers each attempt hit, on average."
                    />
                    <StatTile
                      label="Prize rate"
                      value={ins.totalScored > 0 ? `${ins.hitRate3.toFixed(1)}%` : "—"}
                      tone="emerald"
                      hint="Attempts that matched 3 or more — where prizes start."
                    />
                    <StatTile
                      label="Played, never drawn"
                      value={fmtCount(ins.neverDrawnCount)}
                      tone="amber"
                      hint="Numbers you pick that have never come up in this game."
                    />
                  </div>

                  <section className={CARD_CLASSES}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-base font-semibold text-ink">How your attempts score</h2>
                      {ins.totalScored > 0 && (
                        <span className="text-xs text-ink-3">
                          {fmtCount(ins.totalScored)} scored attempt{ins.totalScored === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-3">
                      Every attempt on a draw with a result, by how many numbers it matched.
                      Green rows are prize tiers.
                    </p>
                    {ins.totalScored === 0 ? (
                      <p className={`${DASHED_EMPTY_CLASSES} mt-3`}>
                        No scored attempts yet — this fills in once a draw&apos;s result is set.
                      </p>
                    ) : (
                      <div className="mt-4 flex flex-col gap-2.5">
                        {ins.histCounts.map((count, tier) => {
                          const pct = (count / ins.totalScored) * 100;
                          return (
                            <div
                              key={tier}
                              className="flex items-center gap-3"
                              title={`${fmtCount(count)} attempt${count === 1 ? "" : "s"} (${pct.toFixed(1)}%) matched ${tier} of 6`}
                            >
                              <span
                                className={`w-9 shrink-0 text-xs font-semibold tabular-nums ${
                                  tier >= 3 ? "text-emerald-700 dark:text-emerald-300" : "text-ink-3"
                                }`}
                              >
                                {tier}/6
                              </span>
                              {/* Scaled to the tallest tier, not the total, so the
                                  shape reads at a glance; the % carries the share. */}
                              <div className="h-2.5 min-w-0 flex-1 rounded bg-surface-2">
                                <div
                                  className={`h-full rounded ${tier >= 3 ? "bg-emerald-500" : "bg-ink-4"}`}
                                  style={{ width: `${count > 0 ? Math.max((count / maxHist) * 100, 1.5) : 0}%` }}
                                />
                              </div>
                              <span className="w-24 shrink-0 text-right text-xs tabular-nums">
                                <span className="font-semibold text-ink">{fmtCount(count)}</span>
                                <span className="text-ink-4"> · {pct.toFixed(0)}%</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className={CARD_CLASSES}>
                    <h2 className="text-base font-semibold text-ink">Your favourite numbers</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      The numbers you play most, beside how often each has actually been drawn.
                      Green = in the latest result.
                    </p>
                    {ins.favourites.length === 0 ? (
                      <p className={`${DASHED_EMPTY_CLASSES} mt-3`}>
                        Log some attempts to see this.
                      </p>
                    ) : (
                      // Two side-by-side columns, each on its own scale with its
                      // own heading — play counts (tens) and draw counts
                      // (hundreds) never share a bar, so neither gets misread
                      // against the other.
                      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 sm:gap-x-6">
                        <span />
                        <span className="text-xs font-medium text-ink-3">You played it</span>
                        <span className="text-xs font-medium text-ink-3">It was drawn</span>
                        {ins.favourites.map((f) => (
                          <Fragment key={f.n}>
                            <NumberBall n={f.n} variant={ins.latestDrawSet.has(f.n) ? "match" : "neutral"} />
                            {(
                              [
                                [f.played, maxFavPlayed, "bg-ink-4", "played"],
                                [f.drawn, maxFavDrawn, "bg-brand", "drawn"],
                              ] as const
                            ).map(([value, max, tone, verb]) => (
                              <div
                                key={verb}
                                className="flex items-center gap-2"
                                title={`${verb === "played" ? "You played" : "Drawn"} ${fmtCount(value)} time${value === 1 ? "" : "s"}`}
                              >
                                <div className="h-2.5 min-w-0 flex-1 rounded bg-surface-2">
                                  <div className={`h-full rounded ${tone}`} style={{ width: `${(value / max) * 100}%` }} />
                                </div>
                                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-2">
                                  {fmtCount(value)}&times;
                                </span>
                              </div>
                            ))}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className={CARD_CLASSES}>
                    <h2 className="text-base font-semibold text-ink">Board coverage</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      Every number from 1 to {maxNumber}, shaded by how often you&apos;ve played it
                      — the stronger the shade, the more you play it. Ringed numbers were in the
                      latest result.
                    </p>
                    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
                      {ins.board.map((c) => {
                        const inLatest = ins.latestDrawSet.has(c.n);
                        return (
                          <div
                            key={c.n}
                            className={`flex aspect-square items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors duration-150 ${BOARD_SWATCH_CLASSES[c.tier]} ${
                              inLatest ? BOARD_SWATCH_CLASSES.latest : ""
                            }`}
                            title={`${String(c.n).padStart(2, "0")}: played ${c.played} time${c.played === 1 ? "" : "s"}${
                              inLatest ? " · in the latest result" : ""
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
                            className={`h-4 w-4 shrink-0 rounded ${BOARD_SWATCH_CLASSES[swatch]} ${
                              swatch === "latest" ? "mx-1" : "" /* room for the ring's offset */
                            }`}
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
              rows={
                attemptsModal.mode === "add" ? 10 : attemptsModal.editingIds.length > 1 ? 6 : 3
              }
              className={`${INPUT_CLASSES} font-mono`}
              placeholder={
                attemptsModal.mode === "add"
                  ? "01 02 34 37 52 57\n03 12 19 27 41 58\n\n07 14 21 28 35 42"
                  : "03 12 19 27 41 58\n01 02 34 37 52 57"
              }
              value={attemptsModal.attemptsText}
              disabled={saving}
              onChange={(e) =>
                setAttemptsModal((m) => ({ ...m, attemptsText: e.target.value }))
              }
            />
            <span className="text-xs text-ink-3">
              {attemptsModal.mode === "add" ? (
                <>
                  One attempt per line, {NUMBERS_HELP} — a blank line starts a new ticket,
                  so each group of lines becomes one ticket&apos;s attempts. Ticket numbers
                  are worked out for you, carrying on from the ones already on this draw.
                </>
              ) : (
                <>
                  One attempt per line, {NUMBERS_HELP} — add more lines for more attempts on
                  the same ticket.
                </>
              )}
            </span>
          </label>
          {attemptsModal.mode === "edit" && (
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
          )}
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
              {renderDrawCard(detail)}
            </Modal>
          );
        })()}
    </div>
  );
}
