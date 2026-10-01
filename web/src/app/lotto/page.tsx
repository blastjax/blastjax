"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon } from "@/components/Icons";
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

const DRAW_SCHEDULE: Record<string, number[]> = {
  "Ultra Lotto 6/58": [0, 2, 5],
  "Grand Lotto 6/55": [1, 3, 6],
  "Superlotto 6/49": [0, 2, 4],
  "Megalotto 6/45": [1, 3, 5],
  "Lotto 6/42": [2, 4, 6],
};

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
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  ACTION_BUTTON_CLASSES,
  alertClasses,
  CARD_CLASSES,
  CLOSE_BUTTON_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
} from "@/lib/ui";

type RoutedRows = { game: LottoGame; lines: string[] };

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
  return { routed: games.flatMap((g) => routed.get(g.id) ?? []), discarded };
}

type ImportSummary = {
  perGame: { name: string; inserted: number; updated: number }[];
  discarded: number;
  errors: string[];
};

export default function LottoGamesPage() {
  const [games, setGames] = useState<LottoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDataTools, setShowDataTools] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

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
  }, []);

  const updateResults = async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const { inserted } = await syncLottoResultsFromPcso();
      setSyncNote({
        tone: "success",
        text:
          inserted > 0
            ? `Added ${fmtCount(inserted)} new result${inserted === 1 ? "" : "s"} from PCSO.`
            : "Already up to date — no new results on PCSO yet.",
      });
      if (inserted > 0) await load();
    } catch (e: unknown) {
      setSyncNote({
        tone: "error",
        text: `Couldn't update from PCSO: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    } finally {
      setSyncing(false);
    }
  };

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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                disabled={syncing || games === null}
                onClick={() => void updateResults()}
                title="Fetch any 6/42–6/58 results newer than what's saved here from pcso.gov.ph"
              >
                {syncing ? "Updating…" : "Update results"}
              </button>
              <button
                type="button"
                className={ACTION_BUTTON_CLASSES}
                aria-expanded={showDataTools}
                onClick={() => setShowDataTools((v) => !v)}
              >
                Data tools <span aria-hidden>{showDataTools ? "▴" : "▾"}</span>
              </button>
            </div>
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

      {error && <ErrorAlert>{error}</ErrorAlert>}
      {syncNote?.tone === "error" && <ErrorAlert>{syncNote.text}</ErrorAlert>}
      {syncNote?.tone === "success" && (
        <p className={alertClasses("success")} role="status">
          {syncNote.text}
        </p>
      )}
      {!error && games === null && <p className={LOADING_TEXT_CLASSES}>Loading…</p>}

      {games && (
        <div className="@container">
          <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @[88rem]:grid-cols-5">
            {games.map((game) => {
              const nextDraw = nextDrawLabel(game.name);
              const latest = game.latest_result;
              const played = game.last_attempt_draw_date;
              const inPlay = played != null && (!latest || played > latest.draw_date);
              const hits = new Set(latest?.best_hits);
              return (
                <Link
                  key={game.id}
                  href={`/lotto/${lottoGameSlug(game.name)}`}
                  className={`${CARD_CLASSES} group flex flex-col transition-colors duration-150 hover:border-line-strong`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold tracking-[-0.2px] text-ink">
                      {game.name}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
                  </span>
                  {nextDraw && (
                    <span className="mt-0.5 text-sm text-ink-3">
                      Next draw{" "}
                      <span
                        className={
                          nextDraw === "Today" ? "font-medium text-brand-text" : "text-ink-2"
                        }
                      >
                        {nextDraw}
                      </span>
                    </span>
                  )}

                  <span className={`${SECTION_LABEL_CLASSES} mt-5`}>Jackpot</span>
                  <span className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-ink">
                    {game.jackpot_prize != null ? fmtJackpotCompact(game.jackpot_prize) : "—"}
                  </span>

                  {latest ? (
                    <span className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={SECTION_LABEL_CLASSES}>Latest result</span>
                        <span className="text-xs text-ink-3">{formatDate(latest.draw_date)}</span>
                      </span>
                      <span className="grid max-w-64 grid-cols-6 gap-1.5">
                        {latest.numbers.map((n) => (
                          <span
                            key={n}
                            className={`flex aspect-square items-center justify-center rounded-full border text-sm font-semibold tabular-nums ${
                              hits.has(n)
                                ? "border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-600"
                                : "border-line-strong bg-surface-2 text-ink"
                            }`}
                          >
                            {String(n).padStart(2, "0")}
                          </span>
                        ))}
                      </span>
                      <span className="flex flex-col gap-1.5 text-sm">
                        <span className="flex justify-between gap-3">
                          <span className="text-ink-3">Jackpot winners</span>
                          <span
                            className={`font-semibold tabular-nums ${
                              latest.winners > 0 ? "text-amber-700 dark:text-amber-300" : "text-ink"
                            }`}
                          >
                            {latest.winners > 0 ? fmtCount(latest.winners) : "None"}
                          </span>
                        </span>
                        <span className="flex justify-between gap-3">
                          <span className="text-ink-3">Your best attempt</span>
                          <span
                            className={`font-semibold tabular-nums ${
                              !latest.best_hits
                                ? "text-ink-4"
                                : hits.size === 6
                                  ? "text-amber-700 dark:text-amber-300"
                                  : hits.size >= 3
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-ink"
                            }`}
                          >
                            {!latest.best_hits
                              ? "Not played"
                              : hits.size === 6
                                ? "Jackpot!"
                                : `${hits.size} of 6`}
                          </span>
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="mt-5 border-t border-line pt-4 text-sm text-ink-3">
                      No results logged yet.
                    </span>
                  )}

                  {played && played !== latest?.draw_date && (
                    <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-ink-3">
                      {inPlay && (
                        <span
                          className="size-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse"
                          aria-hidden
                        />
                      )}
                      {inPlay ? "In play for" : "Last played"} {formatDate(played)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
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
            <ErrorAlert>
              {importError}
            </ErrorAlert>
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
