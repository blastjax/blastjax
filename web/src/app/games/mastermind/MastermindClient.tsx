"use client";

import { useMemo, useState } from "react";
import { CARD_CLASSES, PRIMARY_BUTTON_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";
import {
  allCodes,
  cycleFeedbackPeg,
  emptyAttempt,
  feedbackFromPegs,
  filterCandidates,
  FB_COLOR_ONLY,
  FB_EXACT,
  MAX_ATTEMPTS,
  MAX_COLORS,
  MIN_COLORS,
  CODE_LENGTH,
  COLOR_PALETTE,
  EMPTY_PEG,
  openingGuess,
  pickNextGuess,
  type Attempt,
  type CodeArr,
} from "./logic";

const COLOR_COUNTS = Array.from(
  { length: MAX_COLORS - MIN_COLORS + 1 },
  (_, i) => MIN_COLORS + i,
);

function colorHex(v: number): string {
  return v < 0 ? "transparent" : COLOR_PALETTE[v].hex;
}

function colorName(v: number): string {
  return v < 0 ? "empty" : COLOR_PALETTE[v].name;
}

export default function MastermindClient() {
  const [numColors, setNumColorsState] = useState(6);
  const [attempts, setAttempts] = useState<Attempt[]>(() =>
    Array.from({ length: MAX_ATTEMPTS }, emptyAttempt),
  );
  const [submittedCount, setSubmittedCount] = useState(0);
  /** Which peg of the active row the next legend click will fill. */
  const [pointer, setPointer] = useState(0);

  const codeSpace = useMemo(() => allCodes(numColors), [numColors]);

  const remaining = useMemo(() => {
    let cands: CodeArr[] = codeSpace;
    for (let i = 0; i < submittedCount; i++) {
      cands = filterCandidates(cands, attempts[i].guess, feedbackFromPegs(attempts[i].feedbackPegs));
    }
    return cands;
  }, [codeSpace, attempts, submittedCount]);

  const lastAttempt = submittedCount > 0 ? attempts[submittedCount - 1] : null;
  const lastFeedback = lastAttempt ? feedbackFromPegs(lastAttempt.feedbackPegs) : null;
  const solved = lastFeedback != null && lastFeedback.exact === CODE_LENGTH;
  const outOfAttempts = !solved && submittedCount >= MAX_ATTEMPTS;
  const gameOver = solved || outOfAttempts;
  const contradiction = remaining.length === 0;

  const suggestion = useMemo<CodeArr | null>(() => {
    if (gameOver || contradiction) return null;
    if (submittedCount === 0) return openingGuess(numColors);
    return pickNextGuess(remaining);
  }, [gameOver, contradiction, submittedCount, numColors, remaining]);

  const activeIdx = submittedCount < MAX_ATTEMPTS ? submittedCount : MAX_ATTEMPTS - 1;
  const activeStored = attempts[activeIdx];
  const activeIsBlank = activeStored.guess.every((v) => v === EMPTY_PEG);
  const activeGuessDisplay =
    !gameOver && activeIsBlank && suggestion ? suggestion : activeStored.guess;
  const activeGuessComplete = activeGuessDisplay.every((v) => v !== EMPTY_PEG);

  function resetGame() {
    setAttempts(Array.from({ length: MAX_ATTEMPTS }, emptyAttempt));
    setSubmittedCount(0);
    setPointer(0);
  }

  function setNumColors(n: number) {
    setNumColorsState(n);
    resetGame();
  }

  /** Clicking a peg targets it — the next legend click lands there. */
  function selectPeg(pos: number) {
    if (gameOver) return;
    setPointer(pos);
  }

  /** Clicking a colour in the legend places it at the targeted peg and moves
   * the target on to the next one, wrapping back to the start once the row
   * is full so re-clicking colours redoes the guess from the left. */
  function placeColorAtPointer(colorIdx: number) {
    if (gameOver) return;
    setAttempts((prev) => {
      const next = prev.slice();
      const stored = next[activeIdx];
      const base = (stored.guess.every((v) => v === EMPTY_PEG) && suggestion
        ? suggestion
        : stored.guess
      ).slice();
      base[pointer] = colorIdx;
      next[activeIdx] = { ...stored, guess: base };
      return next;
    });
    setPointer((p) => (p + 1) % CODE_LENGTH);
  }

  /** Grading only applies to a guess that's actually been played, so only
   * submitted rows are gradable — never the one still being built. */
  function cycleFeedbackAt(rowIdx: number, pos: number) {
    if (rowIdx >= submittedCount) return;
    setAttempts((prev) => {
      const next = prev.slice();
      const stored = next[rowIdx];
      const pegs = stored.feedbackPegs.slice();
      pegs[pos] = cycleFeedbackPeg(pegs[pos]);
      next[rowIdx] = { ...stored, feedbackPegs: pegs };
      return next;
    });
  }

  function clearActiveGuess() {
    if (gameOver) return;
    setAttempts((prev) => {
      const next = prev.slice();
      next[activeIdx] = emptyAttempt();
      return next;
    });
    setPointer(0);
  }

  function submit() {
    if (gameOver || !activeGuessComplete) return;
    setAttempts((prev) => {
      const next = prev.slice();
      next[activeIdx] = { ...next[activeIdx], guess: activeGuessDisplay.slice() };
      return next;
    });
    setSubmittedCount((n) => n + 1);
    setPointer(0);
  }

  function undoLast() {
    if (submittedCount === 0) return;
    setSubmittedCount((n) => n - 1);
    setPointer(0);
  }

  const sectionHeading =
    "text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

  const banner = solved
    ? {
        tone: "good" as const,
        text: `🎉 Solved in ${submittedCount} attempt${submittedCount === 1 ? "" : "s"}!`,
      }
    : outOfAttempts
      ? {
          tone: "bad" as const,
          text:
            remaining.length === 1
              ? "Out of attempts — but only one code still fits (see below)."
              : remaining.length > 1
                ? `Out of attempts — ${remaining.length} codes still fit. A feedback entry was probably off.`
                : "Out of attempts — and no code fits every result given. A feedback entry must be wrong.",
        }
      : contradiction
        ? {
            tone: "warn" as const,
            text: "⚠ No code matches every result so far — double-check the feedback on the last row, or Undo it.",
          }
        : null;

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Mastermind
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A solving assistant for playing Mastermind as the codebreaker. Build the guess you
          actually played, mark the feedback you actually got, and it narrows down the code and
          suggests what to try next.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section className={`${CARD_CLASSES} w-full max-w-xs shrink-0 flex flex-col gap-5`}>
          <div className="flex flex-col gap-3">
            <h2 className={sectionHeading}>Setup</h2>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Number of colours
              <select
                value={numColors}
                onChange={(e) => setNumColors(Number(e.target.value))}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {COLOR_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {CODE_LENGTH} pegs · {MAX_ATTEMPTS} attempts
            </p>
            <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={resetGame}>
              ↺ New game
            </button>
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className={sectionHeading}>Suggested guess</h2>
            {suggestion ? (
              <div className="flex items-center gap-1.5">
                {suggestion.map((v, i) => (
                  <span
                    key={i}
                    className="h-7 w-7 shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700"
                    style={{ background: colorHex(v) }}
                    title={colorName(v)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {gameOver ? "Game over." : "No guess to suggest — no code fits."}
              </p>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {remaining.length} possible code{remaining.length === 1 ? "" : "s"} left
              {" · "}
              {MAX_ATTEMPTS - submittedCount} attempt{MAX_ATTEMPTS - submittedCount === 1 ? "" : "s"}{" "}
              left
            </p>
            {remaining.length === 1 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 dark:border-emerald-900 dark:bg-emerald-950/40">
                {remaining[0].map((v, i) => (
                  <span
                    key={i}
                    className="h-6 w-6 shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700"
                    style={{ background: colorHex(v) }}
                    title={colorName(v)}
                  />
                ))}
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  must be it
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className={sectionHeading}>How to use it</h2>
            <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <li>· Click a peg in the bottom row to target it, then click a colour in the legend below to fill it — the target moves on to the next peg each time.</li>
              <li>· Hit Submit once that&apos;s the guess you actually played.</li>
              <li>
                · Then grade it (highlighted below): click a feedback dot to cycle none → ⬤ white
                (right colour, right spot) → ⬤ black (right colour, wrong spot).
              </li>
              <li>· Any submitted row&apos;s grade can be revisited later if you spot a mistake.</li>
              <li>· Undo unlocks the last row again if you want to redo the guess itself.</li>
            </ul>
          </div>
        </section>

        <section className="flex flex-1 min-w-0 flex-col items-center gap-4">
          {banner && (
            <div
              className={`w-full max-w-md rounded-lg border px-4 py-3 text-sm font-medium ${
                banner.tone === "good"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : banner.tone === "bad"
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              }`}
            >
              {banner.text}
            </div>
          )}

          {/* Always a white panel, in both themes, so the grade circles (a
              white fill vs. a black fill) stay legible against it. */}
          <div className="flex w-full max-w-md flex-col-reverse gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            {Array.from({ length: MAX_ATTEMPTS }, (_, idx) => {
              const isActive = idx === activeIdx && !gameOver;
              const isSubmitted = idx < submittedCount;
              const needsGrading = idx === submittedCount - 1;
              const stored = attempts[idx];
              const guess = isActive ? activeGuessDisplay : stored.guess;
              const isGhost = isActive && activeIsBlank && suggestion != null;

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50/60"
                      : needsGrading
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-transparent"
                  }`}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-zinc-400">{idx + 1}</span>

                  <div className="flex items-center gap-1.5">
                    {guess.map((v, pos) => (
                      <GuessPeg
                        key={pos}
                        value={v}
                        ghost={isGhost}
                        interactive={isActive}
                        selected={isActive && pointer === pos}
                        onSelect={() => selectPeg(pos)}
                      />
                    ))}
                  </div>

                  <div className="ml-auto grid grid-cols-2 gap-1.5">
                    {stored.feedbackPegs.map((p, pos) => (
                      <FeedbackPeg
                        key={pos}
                        value={p}
                        interactive={isSubmitted}
                        onClick={() => cycleFeedbackAt(idx, pos)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {!gameOver && (
            <div className="flex gap-2">
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={clearActiveGuess}>
                Clear
              </button>
              <button
                type="button"
                className={`${PRIMARY_BUTTON_CLASSES} disabled:cursor-not-allowed`}
                onClick={submit}
                disabled={!activeGuessComplete}
              >
                Submit
              </button>
            </div>
          )}
          <button
            type="button"
            className={`${SECONDARY_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={undoLast}
            disabled={submittedCount === 0}
          >
            ⬅ Undo last
          </button>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {COLOR_PALETTE.slice(0, numColors).map((c, idx) => (
              <button
                key={c.name}
                type="button"
                disabled={gameOver}
                onClick={() => placeColorAtPointer(idx)}
                title={`Place ${c.name} at peg ${pointer + 1}`}
                aria-label={`Place ${c.name} at the targeted peg`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent p-1 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span
                  className="block h-full w-full rounded-full ring-1 ring-inset ring-black/10"
                  style={{ background: c.hex }}
                />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function GuessPeg({
  value,
  ghost,
  interactive,
  selected,
  onSelect,
}: {
  value: number;
  ghost: boolean;
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const empty = value === EMPTY_PEG;
  const base = "h-9 w-9 shrink-0 rounded-full border-2 transition";
  if (!interactive) {
    return (
      <span
        className={`${base} ${empty ? "border-dashed border-zinc-300" : "border-zinc-300"}`}
        style={{ background: empty ? "transparent" : colorHex(value) }}
        title={colorName(value)}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Guess peg: ${colorName(value)}. Click to target it, then pick a colour below.`}
      title="Click to target this peg, then click a colour in the legend"
      className={`${base} cursor-pointer ${
        empty ? "border-dashed border-zinc-400 hover:border-indigo-400" : "border-zinc-400 hover:brightness-110"
      } ${ghost ? "opacity-40" : ""} ${
        selected ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white" : ""
      }`}
      style={{ background: empty ? "transparent" : colorHex(value) }}
    />
  );
}

function FeedbackPeg({
  value,
  interactive,
  onClick,
}: {
  value: number;
  interactive: boolean;
  onClick: () => void;
}) {
  const isExact = value === FB_EXACT;
  const isColorOnly = value === FB_COLOR_ONLY;
  const classes = `h-6 w-6 rounded-full border-2 transition ${
    isExact
      ? "border-zinc-600 bg-white shadow-sm"
      : isColorOnly
        ? "border-zinc-600 bg-black shadow-sm"
        : "border-dashed border-zinc-300 bg-transparent"
  }`;
  const label = isExact ? "correct position and colour" : isColorOnly ? "correct colour, wrong position" : "no result set";
  if (!interactive) {
    return <span className={classes} title={label} aria-label={label} />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Feedback peg: ${label}. Click to cycle.`}
      title="Click to cycle: none → correct spot → correct colour only"
      className={`${classes} cursor-pointer hover:border-indigo-500`}
    />
  );
}
