"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon, TicketIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import {
  getLottoGames,
  importLottoDrawResultsText,
  lottoGameSlug,
  syncLottoResultsFromPcso,
  type LottoGame,
} from "@/lib/api";
import { formatDate, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtCount, fmtJackpotCompact } from "@/lib/formatNumber";

/** PCSO's fixed weekly draw schedule per game (`Date.getDay()`: 0=Sunday..
 * 6=Saturday) — real-world scheduling, not something anyone edits from this
 * app, so it lives as a UI constant rather than a database column. */
const DRAW_SCHEDULE: Record<string, number[]> = {
  "Ultra Lotto 6/58": [0, 2, 5],
  "Grand Lotto 6/55": [1, 3, 6],
  "Superlotto 6/49": [0, 2, 4],
  "Megalotto 6/45": [1, 3, 5],
  "Lotto 6/42": [2, 4, 6],
};

/** "Today"/"Tomorrow", or the next scheduled draw date's `formatDate`
 * display — null for a game with no known schedule (so the card just omits
 * the line). */
function nextDrawLabel(gameName: string): string | null {
  const schedule = DRAW_SCHEDULE[gameName];
  if (!schedule || schedule.length === 0) return null;
  const today = new Date();
  const todayDow = today.getDay();
  let offset = 0;
  while (!schedule.includes((todayDow + offset) % 7)) offset += 1;
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const next = new Date(today);
  next.setDate(next.getDate() + offset);
  return formatDate(toIsoDateLocal(next));
}
import {
  ACTION_BUTTON_CLASSES,
  alertClasses,
  CARD_CLASSES,
  CLOSE_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

/** One game's slice of a mixed paste: the game it routes to, and the rows
 * addressed to it, verbatim. */
type RoutedRows = { game: LottoGame; lines: string[] };

/** Splits a results paste across games by its leading game-name column.
 *
 * The results site lists a day's draws in one table — 6/42 through 6/58
 * alongside the 2D/3D/4D/6D games this app doesn't track — so a paste
 * arrives mixed. The name before the first tab picks the game; a row naming
 * something untracked (`3D Lotto 2PM`) is discarded, as is a row with no
 * name column at all, since there's nothing to route it by. The rest of the
 * row is passed through untouched for the server's parser, which discards
 * the name column itself.
 */
function routeRowsByGame(
  text: string,
  games: LottoGame[],
): { routed: RoutedRows[]; discarded: number } {
  const byName = new Map(games.map((g) => [g.name.trim().toLowerCase(), g]));
  const routed = new Map<number, RoutedRows>();
  let discarded = 0;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    const game = tab === -1 ? undefined : byName.get(line.slice(0, tab).trim().toLowerCase());
    if (!game) {
      discarded += 1;
      continue;
    }
    const slice = routed.get(game.id) ?? { game, lines: [] };
    slice.lines.push(line);
    routed.set(game.id, slice);
  }
  // Card order, so the summary reads in the same order as the page.
  return { routed: games.flatMap((g) => routed.get(g.id) ?? []), discarded };
}

type ImportSummary = {
  perGame: { name: string; inserted: number; updated: number }[];
  discarded: number;
  errors: string[];
};

/** `/lotto` picks a game first — each one keeps its own draws and attempts,
 * all through the same page underneath. Data tools here works across games:
 * one paste of a day's results table loads every game it names. */
export default function LottoGamesPage() {
  const [games, setGames] = useState<LottoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDataTools, setShowDataTools] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await getLottoGames();
      setGames(r.games);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load games.");
    }
  };

  useEffect(() => {
    void load();
    // New results from pcso.gov.ph land in the background, alongside the
    // cards; they only reload when something was added (a new jackpot).
    syncLottoResultsFromPcso()
      .then((r) => {
        if (r.inserted > 0) void load();
      })
      .catch((e: unknown) =>
        setSyncError(e instanceof Error ? e.message : "Couldn't check PCSO for new results."),
      );
  }, []);

  const openImport = () => {
    setImportError(null);
    setImportSummary(null);
    setImportText("");
    setImportOpen(true);
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportError(null);
    setImportSummary(null);
  };

  /** Imports a mixed paste through the per-game endpoint that already
   * exists (`POST /api/lotto/import-text`), one call per game the paste
   * actually names — upsert-by-date there means re-pasting a day's table
   * backfills jackpot/winners rather than duplicating draws. */
  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSummary(null);
    if (!importText.trim()) {
      setImportError("Paste in some rows first.");
      return;
    }
    const { routed, discarded } = routeRowsByGame(importText, games ?? []);
    if (routed.length === 0) {
      setImportError(
        "No row named a game tracked here. Each row needs a game name and a tab ahead of the numbers, e.g. \"Ultra Lotto 6/58\" then 18-03-22-20-19-43.",
      );
      return;
    }
    setSaving(true);
    try {
      const perGame: ImportSummary["perGame"] = [];
      const errors: string[] = [];
      for (const { game, lines } of routed) {
        const r = await importLottoDrawResultsText(game.id, lines.join("\n"));
        perGame.push({ name: game.name, inserted: r.inserted, updated: r.updated });
        errors.push(...r.errors.map((msg) => `${game.name} — ${msg}`));
      }
      setImportSummary({ perGame, discarded, errors });
      setImportText("");
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const importedRows = importSummary
    ? importSummary.perGame.reduce((sum, g) => sum + g.inserted + g.updated, 0)
    : 0;

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <header>
        <PageHeader
          title="Lotto"
          description="Pick a game to log draws and check your attempts."
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
              onClick={openImport}
              disabled={games === null}
              title="Bulk-load a day's results table for every game at once — rows for games not tracked here are discarded"
            >
              Import historic results
            </button>
          </div>
        )}
      </header>

      {error && <p className={ERROR_ALERT_CLASSES}>{error}</p>}
      {syncError && (
        <p className="text-sm text-ink-3">Couldn&apos;t fetch new results from PCSO: {syncError}</p>
      )}
      {!error && games === null && <p className={LOADING_TEXT_CLASSES}>Loading…</p>}

      {games && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => {
            const nextDraw = nextDrawLabel(game.name);
            return (
              <Link
                key={game.id}
                href={`/lotto/${lottoGameSlug(game.name)}`}
                className={`${CARD_CLASSES} group flex items-start gap-4`}
              >
                <span
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text"
                  aria-hidden
                >
                  <TicketIcon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-base font-semibold tracking-[-0.2px] text-ink">
                      {game.name}
                    </span>
                    <ChevronRightIcon className="size-4 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
                  </span>
                  <span className="mt-1 block text-sm text-ink-3">
                    {game.jackpot_prize != null
                      ? `Jackpot ${fmtJackpotCompact(game.jackpot_prize)}`
                      : "No jackpot logged yet"}
                  </span>
                  {nextDraw && (
                    <span className="mt-0.5 block text-sm text-ink-3">
                      Next draw: {nextDraw}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={importOpen}
        onClose={closeImport}
        ariaLabelledBy="lotto-games-import-title"
        dialogClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="lotto-games-import-title" className="text-lg font-semibold text-ink">
            Import historic results
          </h2>
          <button type="button" className={CLOSE_BUTTON_CLASSES} onClick={closeImport}>
            Close
          </button>
        </div>
        <form onSubmit={submitImport} className="flex flex-col gap-4">
          {importError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {importError}
            </div>
          )}
          {importSummary && (
            <div className={alertClasses("success")}>
              Imported {fmtCount(importedRows)} row{importedRows === 1 ? "" : "s"} across{" "}
              {fmtCount(importSummary.perGame.length)} game
              {importSummary.perGame.length === 1 ? "" : "s"}:
              <ul className="mt-1 list-disc pl-5">
                {importSummary.perGame.map((g) => (
                  <li key={g.name}>
                    {g.name} — {fmtCount(g.inserted)} added, {fmtCount(g.updated)} updated
                  </li>
                ))}
              </ul>
              {importSummary.discarded > 0 && (
                <div className="mt-1">
                  {fmtCount(importSummary.discarded)} row
                  {importSummary.discarded === 1 ? "" : "s"} discarded — not a game tracked here.
                </div>
              )}
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
              value={importText}
              disabled={saving}
              onChange={(e) => setImportText(e.target.value)}
            />
            <span className="text-xs text-ink-3">
              A whole day&apos;s results table, pasted straight from the results site: game name,
              then <code>n1-n2-n3-n4-n5-n6</code>, <code>m/d/yyyy</code>, jackpot and winners, one
              draw per line, tab-separated. The name picks the game, so 6/42, 6/45, 6/49, 6/55 and
              6/58 rows all load at once and rows for anything else (2D, 3D, 4D, 6D) are
              discarded. Each row is upserted by date, so re-pasting overwrites rather than
              duplicating.
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
              onClick={closeImport}
            >
              {importSummary ? "Done" : "Cancel"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
