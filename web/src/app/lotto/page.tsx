"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarMonth } from "@/components/CalendarMonth";
import { ChevronRightIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import {
  getLottoCalendar,
  getLottoGames,
  importLottoDrawResultsText,
  lottoGameSlug,
  syncLottoResultsFromPcso,
  type LottoDrawResult,
  type LottoGame,
} from "@/lib/api";
import { addMonths, formatDate, formatDateLong, monthKey, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtCount, fmtJackpotCompact } from "@/lib/formatNumber";
import { MatchPill, NumberBall, NumberChip, ScoreCell } from "./LottoClient";

const DRAW_SCHEDULE: Record<string, number[]> = {
  "Ultra Lotto 6/58": [0, 2, 5],
  "Grand Lotto 6/55": [1, 3, 6],
  "Superlotto 6/49": [0, 2, 4],
  "Megalotto 6/45": [1, 3, 5],
  "Lotto 6/42": [2, 4, 6],
};

// Colorblind-checked palette (light / dark). The pairs that are hard to tell apart
// (orange–yellow, orange–magenta, magenta–aqua) only go to games that never draw on the same night.
const GAME_COLORS: Record<string, string> = {
  "Lotto 6/42": "text-[#2a78d6] dark:text-[#3987e5]",
  "Megalotto 6/45": "text-[#1baf7a] dark:text-[#199e70]",
  "Superlotto 6/49": "text-[#e87ba4] dark:text-[#d55181]",
  "Grand Lotto 6/55": "text-[#eb6834] dark:text-[#d95926]",
  "Ultra Lotto 6/58": "text-[#eda100] dark:text-[#c98500]",
};

const DAY_FILLS = {
  played: { label: "You played", className: "bg-emerald-700 text-white" },
  winner: { label: "Jackpot won by someone else", className: "bg-zinc-500 text-white" },
  won: { label: "You won the jackpot", className: "bg-white text-zinc-900 shadow-md ring-1 ring-zinc-400" },
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
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  LoadingBlocks,
  ModalHeader,
  Segmented,
} from "@/components/FinanceUI";
import {
  ACTION_BUTTON_CLASSES,
  alertClasses,
  CARD_CLASSES,
  INPUT_CLASSES,
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

const STAR_POINTS = "5,0 6.12,3.45 9.76,3.45 6.82,5.59 7.94,9.05 5,6.91 2.06,9.05 3.18,5.59 0.24,3.45 3.88,3.45";

type DayDraw = { game: LottoGame; result: LottoDrawResult };

const isJackpotWon = (result: LottoDrawResult) => result.winners > 0 || result.best_hits?.length === 6;

function dayFill(draws: DayDraw[]): keyof typeof DAY_FILLS | null {
  if (draws.some(({ result }) => result.best_hits?.length === 6)) return "won";
  if (draws.some(({ result }) => result.winners > 0)) return "winner";
  if (draws.some(({ result }) => result.best_hits)) return "played";
  return null;
}

function drawLabel({ game, result }: DayDraw): string {
  const won = result.best_hits?.length === 6;
  const notes = [
    won ? "you won the jackpot" : result.winners > 0 && "jackpot won",
    result.best_hits && !won && "you played",
  ].filter(Boolean);
  return notes.length ? `${game.name}: ${notes.join(", ")}` : game.name;
}

function DayMark({ day, draws }: { day: number; draws: DayDraw[] }) {
  const n = draws.length;
  // ~24 dashes around the ring, rounded to a multiple of n so the colors alternate evenly.
  const dash = (2 * Math.PI * 19) / (n * Math.round(24 / n));
  const fill = dayFill(draws);
  const label = draws.map(drawLabel).join("\n");
  const jackpots = draws.filter(({ result }) => isJackpotWon(result));
  return (
    <span className="absolute inset-0" data-tooltip={label}>
      <span className="sr-only">{label}</span>
      {fill && (
        <span
          aria-hidden
          className={`absolute inset-[12.5%] flex items-center justify-center rounded-full ${DAY_FILLS[fill].className}`}
        >
          {day}
        </span>
      )}
      <svg
        viewBox="0 0 40 40"
        aria-hidden
        className={`size-full ${n > 1 ? "motion-safe:animate-[spin_12s_linear_infinite]" : ""}`}
      >
        {draws.map(({ game }, i) => (
          <circle
            key={game.id}
            cx="20"
            cy="20"
            r="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={n > 1 ? `${dash} ${dash * (n - 1)}` : undefined}
            strokeDashoffset={-dash * i}
            className={GAME_COLORS[game.name]}
          />
        ))}
      </svg>
      {jackpots.length > 0 && (
        <svg viewBox="0 0 40 40" aria-hidden className="absolute inset-0 size-full overflow-visible">
          {jackpots.map(({ game }, i) => (
            <polygon
              key={game.id}
              points={STAR_POINTS}
              transform={`translate(${14 + (i - (jackpots.length - 1) / 2) * 12.5} -3) scale(1.2)`}
              fill="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              paintOrder="stroke"
              className={`stroke-surface ${GAME_COLORS[game.name]}`}
            />
          ))}
        </svg>
      )}
    </span>
  );
}

function DayDrawsModal({ iso, draws, onClose }: { iso: string; draws: DayDraw[]; onClose: () => void }) {
  // Open on the game that decided the day's fill: your win, then a jackpot, then a draw you played.
  const rank = ({ result }: DayDraw) =>
    result.best_hits?.length === 6 ? 3 : result.winners > 0 ? 2 : result.best_hits ? 1 : 0;
  const [tab, setTab] = useState(() => draws.reduce((a, b) => (rank(b) > rank(a) ? b : a)).game.id);
  const { game, result } = draws.find((d) => d.game.id === tab) ?? draws[0];
  const drawn = new Set(result.numbers);
  const hasResult = result.numbers.every((n) => n != null);
  const hits = (nums: number[]) => nums.filter((n) => drawn.has(n)).length;
  const attempts = hasResult ? [...result.attempts].sort((a, b) => hits(b) - hits(a)) : result.attempts;

  return (
    <Modal open onClose={onClose} ariaLabelledBy="day-draws-title" dialogClassName={`${DIALOG_CLASSES} max-w-lg`}>
      <ModalHeader id="day-draws-title" title={formatDateLong(iso)} onClose={onClose} />
      <div className={`${DIALOG_BODY_CLASSES} flex flex-col gap-5`}>
        <Segmented
          label="Games drawn this day"
          options={draws.map(({ game: g, result: r }) => ({
            value: g.id,
            label: (
              <>
                <span
                  aria-hidden
                  className={`size-3 shrink-0 rounded-full border-2 border-current bg-surface ${GAME_COLORS[g.name]}`}
                />
                {g.name}
                {isJackpotWon(r) && <span aria-hidden>★</span>}
              </>
            ),
          }))}
          value={game.id}
          onChange={setTab}
          className="max-w-full flex-wrap self-start"
        />
        {hasResult ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className={SECTION_LABEL_CLASSES}>Winning numbers</span>
              {result.best_hits && <MatchPill count={result.best_hits.length} />}
            </div>
            <div className="flex flex-wrap gap-2">
              {result.numbers.map((n) => (
                <NumberBall key={n} n={n} variant={result.best_hits?.includes(n) ? "match" : "result"} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-3">The result isn&apos;t in yet.</p>
        )}
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className={SECTION_LABEL_CLASSES}>Jackpot</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {result.jackpot_prize != null ? fmtJackpotCompact(result.jackpot_prize) : "—"}
            </dd>
          </div>
          <div>
            <dt className={SECTION_LABEL_CLASSES}>Jackpot winners</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {result.winners > 0 ? fmtCount(result.winners) : "None"}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2">
          <span className={SECTION_LABEL_CLASSES}>
            Your attempts{attempts.length > 0 && ` · ${fmtCount(attempts.length)}`}
          </span>
          {attempts.length === 0 ? (
            <p className="text-sm text-ink-3">You didn&apos;t play this draw.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attempts.map((nums, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 gap-1.5">
                    {nums.map((n) => (
                      <NumberChip key={n} n={n} variant={!hasResult ? "neutral" : drawn.has(n) ? "match" : "miss"} />
                    ))}
                  </div>
                  {hasResult && <ScoreCell count={hits(nums)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href={`/lotto/${lottoGameSlug(game.name)}`}
          className="self-start text-sm font-medium text-brand-text hover:underline"
        >
          Open {game.name} →
        </Link>
      </div>
    </Modal>
  );
}

function DrawCalendar({ games }: { games: LottoGame[] }) {
  const [view, setView] = useState(() => {
    const now = new Date();
    return addMonths(now.getFullYear(), now.getMonth() + 1, 0);
  });
  const [month, setMonth] = useState<{ key: string; draws: LottoDrawResult[] } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    getLottoCalendar(view.y, view.m)
      .then((r) => {
        if (stale) return;
        setMonth({ key: monthKey(view.y, view.m), draws: r.draws });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!stale) setError(e instanceof Error ? e.message : "Failed to load draws.");
      });
    return () => {
      stale = true;
    };
  }, [view.y, view.m, games]);

  const loaded = month?.key === monthKey(view.y, view.m);
  const gameById = new Map(games.map((g) => [g.id, g]));
  const byDate = new Map<string, DayDraw[]>();
  for (const result of month?.draws ?? []) {
    const game = gameById.get(result.game_id);
    if (game) byDate.set(result.draw_date, [...(byDate.get(result.draw_date) ?? []), { game, result }]);
  }
  const openDraws = openDay ? byDate.get(openDay) : undefined;

  return (
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-semibold text-ink">Draw calendar</h2>
      <p className="mt-0.5 text-sm text-ink-3">Each ring is a game drawn that day.</p>
      {error && <ErrorAlert className="mt-4">{error}</ErrorAlert>}
      <div className="mt-4">
        <CalendarMonth
          fluid
          year={view.y}
          month={view.m}
          dayState={() => "none"}
          onSelectDay={(iso) => {
            if (byDate.has(iso)) setOpenDay(iso);
          }}
          disabledDay={(iso) => loaded && !byDate.has(iso)}
          dayAdornment={(iso) => {
            const draws = byDate.get(iso);
            return draws && <DayMark day={Number(iso.slice(8))} draws={draws} />;
          }}
          onNavigate={(y, m) => setView({ y, m })}
        />
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4 text-sm">
        <ul className="flex flex-wrap gap-x-6 gap-y-2.5">
          {games.map((g) => (
            <li key={g.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`size-3.5 shrink-0 rounded-full border-2 border-current ${GAME_COLORS[g.name]}`}
              />
              <span className="text-ink-2">{g.name}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-6 gap-y-2.5">
          {Object.values(DAY_FILLS).map(({ label, className }) => (
            <li key={label} className="flex items-center gap-2.5">
              <span aria-hidden className={`size-3.5 shrink-0 rounded-full ${className}`} />
              <span className="text-ink-2">{label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2.5">
            <svg viewBox="0 0 10 10" aria-hidden className="size-3.5 shrink-0 fill-current text-ink-3">
              <polygon points={STAR_POINTS} />
            </svg>
            <span className="text-ink-2">Star in a game&apos;s color: that game&apos;s jackpot was won</span>
          </li>
        </ul>
      </div>
      {openDay && openDraws && (
        <DayDrawsModal key={openDay} iso={openDay} draws={openDraws} onClose={() => setOpenDay(null)} />
      )}
    </section>
  );
}

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
                data-tooltip="Fetch any 6/42–6/58 results newer than what's saved here from pcso.gov.ph"
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
              data-tooltip="Bulk-load a day's results table for every game at once — rows for games not tracked here are discarded"
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
      {!error && games === null && <LoadingBlocks label="Loading games…" />}

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

      {games && <DrawCalendar games={games} />}

      <Modal
        open={importOpen}
        onClose={closeImport}
        ariaLabelledBy="lotto-games-import-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-3xl`}
      >
        <ModalHeader id="lotto-games-import-title" title="Import historic results" onClose={closeImport} />
        <form onSubmit={submitImport} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} flex flex-col gap-4`}>
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
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeImport}
            >
              {importSummary ? "Done" : "Cancel"}
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Importing…" : "Import"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
