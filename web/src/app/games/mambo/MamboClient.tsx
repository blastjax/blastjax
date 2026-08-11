"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CARD_CLASSES,
  INPUT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";
import {
  generateMamboPuzzle,
  solveMambo,
  solveMamboSteps,
  type MamboBoard,
  type MamboDifficulty,
  type MamboStep,
} from "@/lib/api";
import {
  CIRCLE,
  EMPTY,
  SIGN_GLYPHS,
  SIGN_NONE,
  SYMBOL_LABELS,
  cellKey,
  cloneGrid,
  colCounts,
  countFilled,
  decodePuzzle,
  emptyGrid,
  emptyHSigns,
  emptyVSigns,
  encodePuzzle,
  findConflicts,
  isComplete,
  nextSign,
  nextValue,
  prevValue,
  rowCounts,
  type Grid,
  type SignGrid,
} from "./logic";

const SIDES = [4, 6, 8, 10, 12, 14, 16] as const;
const DIFFICULTIES: readonly MamboDifficulty[] = ["easy", "medium", "hard"];

const CIRCLE_COLOR = "#6366f1";
const SQUARE_COLOR = "#f59e0b";

const MAX_BOARD_PX = 560;
/** Reserved space around the board in full-screen mode: the fixed-width side
 * panel (+ gaps/padding) horizontally, the compact header vertically. Both
 * edges carry labels, so each axis gives up two of them. */
const ROW_LABEL_W = 26;
const COL_LABEL_H = 18;
const FULLSCREEN_RESERVE_W = 380 + 2 * ROW_LABEL_W;
const FULLSCREEN_RESERVE_H = 170 + 2 * COL_LABEL_H;

type Busy = "solve" | "steps" | "hint" | null;

const TECHNIQUE_LABELS: Record<string, string> = {
  "sign-equal": "= sign",
  "sign-opposite": "✕ sign",
  pair: "Pair",
  sandwich: "Sandwich",
  count: "Line full",
  elimination: "Only option",
  deep: "Look ahead",
};

function techniqueLabel(technique: string): string {
  return TECHNIQUE_LABELS[technique] ?? technique;
}

/** Always holds the latest value, for reading fresh state from inside a
 * setInterval callback without recreating the interval every render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/** The two symbols, drawn at a size relative to the cell they sit in. */
function SymbolMark({ value, faded }: { value: number; faded: boolean }) {
  if (value === EMPTY) return null;
  const circle = value === CIRCLE;
  return (
    <span
      className={`pointer-events-none block ${circle ? "rounded-full" : "rounded-[20%]"}`}
      style={{
        width: circle ? "62%" : "58%",
        height: circle ? "62%" : "58%",
        background: circle ? CIRCLE_COLOR : SQUARE_COLOR,
        // Cells the solver filled in stay visibly lighter than the puzzle's
        // own clues, the way a pencilled-in answer would.
        opacity: faded ? 0.72 : 1,
      }}
    />
  );
}

export default function MamboClient() {
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(8);

  /** The board as configured: EMPTY everywhere not yet given a clue. `grid`
   * starts as a copy and only diverges once a solve fills in the rest. */
  const [puzzle, setPuzzle] = useState<Grid>(() => emptyGrid(8, 8));
  const [grid, setGrid] = useState<Grid>(() => emptyGrid(8, 8));
  const [hSigns, setHSigns] = useState<SignGrid>(() => emptyHSigns(8, 8));
  const [vSigns, setVSigns] = useState<SignGrid>(() => emptyVSigns(8, 8));

  const [difficulty, setDifficulty] = useState<MamboDifficulty>("medium");
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [steps, setSteps] = useState<MamboStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [solveStatus, setSolveStatus] = useState<string | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const windowSize = useWindowSize();

  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlaying = useCallback(() => {
    setPlaying(false);
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  useEffect(() => stopPlaying, [stopPlaying]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const conflicts = useMemo(() => findConflicts(grid, hSigns, vSigns), [grid, hSigns, vSigns]);
  const complete = useMemo(() => isComplete(grid), [grid]);
  const filled = useMemo(() => countFilled(grid), [grid]);

  const board: MamboBoard = useMemo(() => ({ grid, hSigns, vSigns }), [grid, hSigns, vSigns]);

  const puzzleCode = useMemo(
    () => encodePuzzle(puzzle, hSigns, vSigns),
    [puzzle, hSigns, vSigns],
  );

  /** Any change to the board makes a fetched solution stale, since every step
   * was derived from the exact state it was requested for. */
  const invalidateSteps = useCallback(() => {
    stopPlaying();
    setSteps(null);
    setStepIndex(0);
    setSolveStatus(null);
    setSolveError(null);
  }, [stopPlaying]);

  function resizeBoard(nextRows: number, nextCols: number) {
    stopPlaying();
    setRows(nextRows);
    setCols(nextCols);
    setPuzzle(emptyGrid(nextRows, nextCols));
    setGrid(emptyGrid(nextRows, nextCols));
    setHSigns(emptyHSigns(nextRows, nextCols));
    setVSigns(emptyVSigns(nextRows, nextCols));
    setGenerateStatus(null);
    setGenerateError(null);
    invalidateSteps();
  }

  function newBlankBoard() {
    resizeBoard(rows, cols);
  }

  function cycleCell(r: number, c: number, backwards: boolean) {
    const step = backwards ? prevValue : nextValue;
    const value = step(puzzle[r][c]);
    setPuzzle((prev) => {
      const next = cloneGrid(prev);
      next[r][c] = value;
      return next;
    });
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[r][c] = value;
      return next;
    });
    invalidateSteps();
  }

  function cycleSign(kind: "h" | "v", r: number, c: number) {
    const setter = kind === "h" ? setHSigns : setVSigns;
    setter((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = nextSign(prev[r][c]);
      return next;
    });
    invalidateSteps();
  }

  function clearSigns() {
    setHSigns(emptyHSigns(rows, cols));
    setVSigns(emptyVSigns(rows, cols));
    invalidateSteps();
  }

  /** Clears any revealed solution or walkthrough fills, back to just the clues. */
  function resetBoard() {
    setGrid(cloneGrid(puzzle));
    invalidateSteps();
  }

  async function generate() {
    stopPlaying();
    setGenerating(true);
    setGenerateError(null);
    setGenerateStatus(null);
    setCodeError(null);
    try {
      const result = await generateMamboPuzzle(rows, cols, difficulty, 15000);
      setPuzzle(result.grid);
      setGrid(cloneGrid(result.grid));
      setHSigns(result.hSigns);
      setVSigns(result.vSigns);
      invalidateSteps();
      const signCount =
        result.hSigns.flat().filter((s) => s !== SIGN_NONE).length +
        result.vSigns.flat().filter((s) => s !== SIGN_NONE).length;
      // Three outcomes worth telling apart: the level asked for, a level the
      // generator settled for, and a level it never got to confirm.
      const levelText = result.exactMatch
        ? result.difficulty
        : !result.difficultyConfirmed
          ? `${result.difficulty} at worst (ran out of time to pin it down)`
          : `${result.difficulty} — closest it found in ${result.attempts} attempts`;
      setGenerateStatus(
        `${levelText} · ${result.givenCount} clues · ${signCount} sign${
          signCount === 1 ? "" : "s"
        } · one solution.`,
      );
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generate failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function revealSolution() {
    stopPlaying();
    setBusy("solve");
    setSolveError(null);
    setSolveStatus(null);
    try {
      const result = await solveMambo(board, 8000);
      if (!result.solution) {
        setSolveError(
          result.timedOut
            ? "Timed out before finding a solution — try a smaller board."
            : "No solution from here — one of the entries must be wrong. Reset to start over.",
        );
        return;
      }
      setSteps(null);
      setStepIndex(0);
      setGrid(result.solution);
      setSolveStatus(
        result.unique
          ? "Solved — this was the only possible answer."
          : result.timedOut
            ? "Solved, but the search ran out of time before it could check for other answers."
            : "Solved — but the puzzle is ambiguous: it has more than one answer.",
      );
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : "Solve failed.");
    } finally {
      setBusy(null);
    }
  }

  /** Fetches the forced-cell walkthrough for the board as it stands. Returns
   * the steps so `hint` can apply the first one immediately. */
  async function fetchSteps(kind: "steps" | "hint"): Promise<MamboStep[] | null> {
    stopPlaying();
    setBusy(kind);
    setSolveError(null);
    setSolveStatus(null);
    try {
      const result = await solveMamboSteps(board, 10000);
      if (result.conflict) {
        setSolveError("The board already breaks a rule — the red cells show where.");
        return null;
      }
      if (result.solutionCount === 0) {
        setSolveError(
          result.timedOut
            ? "Timed out before finding a solution — try a smaller board."
            : "No solution from here — one of the entries must be wrong. Reset to start over.",
        );
        return null;
      }
      if (!result.steps.length) {
        setSolveStatus(
          complete
            ? "Nothing left to deduce — the board is already full."
            : "No cell is forced from here, so the puzzle has more than one answer. Add a clue or a sign.",
        );
        return null;
      }
      setSteps(result.steps);
      setStepIndex(0);
      setSolveStatus(
        `${result.steps.length} forced cell${result.steps.length === 1 ? "" : "s"} from here` +
          `${result.solved ? "" : " (they don't finish the board — it has more than one answer)"}` +
          `${result.unique ? " · one solution" : ""}.`,
      );
      return result.steps;
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : "Solve failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function showSteps() {
    await fetchSteps("steps");
  }

  async function hint() {
    const fetched = await fetchSteps("hint");
    if (!fetched) return;
    applyStep(fetched[0]);
    setStepIndex(1);
  }

  function applyStep(step: MamboStep) {
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[step.r][step.c] = step.value;
      return next;
    });
  }

  const stepNext = useCallback(() => {
    if (!steps || stepIndex >= steps.length) {
      stopPlaying();
      return;
    }
    const step = steps[stepIndex];
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[step.r][step.c] = step.value;
      return next;
    });
    setStepIndex(stepIndex + 1);
  }, [steps, stepIndex, stopPlaying]);

  function stepPrev() {
    if (!steps || stepIndex <= 0) return;
    stopPlaying();
    const step = steps[stepIndex - 1];
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[step.r][step.c] = EMPTY;
      return next;
    });
    setStepIndex(stepIndex - 1);
  }

  const stepNextLatest = useLatest(stepNext);

  function startPlaying(speedValue: number) {
    setPlaying(true);
    const delay = Math.max(120, 1100 - speedValue * 100);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = setInterval(() => stepNextLatest.current(), delay);
  }

  function togglePlay() {
    if (!steps) return;
    if (playing) {
      stopPlaying();
      return;
    }
    if (stepIndex >= steps.length) return;
    startPlaying(speed);
  }

  function onSpeedChange(v: number) {
    setSpeed(v);
    if (playing) startPlaying(v);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(puzzleCode);
      setCopyFeedback("Copied!");
    } catch {
      setCopyFeedback("Couldn't copy — select the text and copy manually.");
    }
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  function loadFromCode() {
    const decoded = decodePuzzle(codeInput);
    if (!decoded) {
      setCodeError("That code doesn't look valid.");
      return;
    }
    stopPlaying();
    setRows(decoded.grid.length);
    setCols(decoded.grid[0].length);
    setPuzzle(decoded.grid);
    setGrid(cloneGrid(decoded.grid));
    setHSigns(decoded.hSigns);
    setVSigns(decoded.vSigns);
    setCodeError(null);
    setGenerateStatus(null);
    invalidateSteps();
  }

  const { cellPx, gapPx } = useMemo(() => {
    let boardPx = MAX_BOARD_PX;
    if (fullscreen && windowSize.width > 0) {
      const availW = windowSize.width - FULLSCREEN_RESERVE_W;
      const availH = windowSize.height - FULLSCREEN_RESERVE_H;
      boardPx = Math.max(240, Math.min(availW, availH));
    }
    const n = Math.max(rows, cols);
    // n cells plus (n - 1) gaps, each gap ~0.3 of a cell.
    const cell = Math.min(54, Math.max(16, Math.floor(boardPx / (n + 0.3 * (n - 1)))));
    return { cellPx: cell, gapPx: Math.min(16, Math.max(7, Math.round(cell * 0.3))) };
  }, [rows, cols, fullscreen, windowSize]);

  const colTemplate = useMemo(
    () =>
      Array.from({ length: 2 * cols - 1 }, (_, i) =>
        i % 2 === 0 ? `${cellPx}px` : `${gapPx}px`,
      ).join(" "),
    [cols, cellPx, gapPx],
  );
  const rowTemplate = useMemo(
    () =>
      Array.from({ length: 2 * rows - 1 }, (_, i) =>
        i % 2 === 0 ? `${cellPx}px` : `${gapPx}px`,
      ).join(" "),
    [rows, cellPx, gapPx],
  );

  /** Per-line tint for the edge labels: red when a symbol overflows its half,
   * green once the line is full and even. */
  const lineState = useCallback(
    (counts: [number, number], length: number) => {
      const half = length / 2;
      if (counts[0] > half || counts[1] > half) return "over";
      if (counts[0] === half && counts[1] === half) return "done";
      return "open";
    },
    [],
  );

  // The board sits on its own white panel in both themes, so its labels,
  // cells and signs keep their light-mode colours throughout.
  const labelClass = (state: string) =>
    `flex items-center justify-center overflow-hidden text-[10px] font-medium ${
      state === "over"
        ? "text-red-600"
        : state === "done"
          ? "text-emerald-600"
          : "text-zinc-500"
    }`;

  /** Edge labels, rendered on both sides of each axis so a line's number is
   * reachable from whichever end you're reading from. */
  const colLabels = (
    <div className="flex" style={{ paddingLeft: ROW_LABEL_W, gap: gapPx }}>
      {Array.from({ length: cols }, (_, c) => (
        <div
          key={c}
          style={{ width: cellPx, height: COL_LABEL_H }}
          className={labelClass(lineState(colCounts(grid, c), rows))}
        >
          {c + 1}
        </div>
      ))}
    </div>
  );
  const rowLabels = (
    <div className="flex flex-col" style={{ gap: gapPx }}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          style={{ width: ROW_LABEL_W, height: cellPx }}
          className={labelClass(lineState(rowCounts(grid, r), cols))}
        >
          {r + 1}
        </div>
      ))}
    </div>
  );

  const nextStep = steps && stepIndex < steps.length ? steps[stepIndex] : null;
  const lastStep = steps && stepIndex > 0 ? steps[stepIndex - 1] : null;

  const fullBoardWarning =
    complete && conflicts.messages.length
      ? `The board is full but breaks ${conflicts.messages.length} rule${
          conflicts.messages.length === 1 ? "" : "s"
        }.`
      : null;

  const disabledSecondary = `${SECONDARY_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-50`;
  const disabledPrimary = `${PRIMARY_BUTTON_CLASSES} disabled:cursor-not-allowed`;

  const rootClasses = fullscreen
    ? "fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col gap-3 overflow-hidden bg-[var(--background)] p-3"
    : "box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8";
  const layoutClasses = fullscreen
    ? "flex min-h-0 flex-1 flex-nowrap items-start gap-4 overflow-hidden"
    : "flex flex-wrap items-start gap-6";
  const panelClasses = fullscreen
    ? `${CARD_CLASSES} h-full w-80 shrink-0 flex flex-col gap-5 overflow-y-auto`
    : `${CARD_CLASSES} w-full max-w-xs shrink-0 flex flex-col gap-5`;
  const boardSectionClasses = fullscreen
    ? "flex h-full min-h-0 flex-1 min-w-0 flex-col items-center justify-center gap-4 overflow-auto"
    : "flex flex-1 min-w-0 flex-col items-center gap-4";

  const sectionHeading =
    "text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

  return (
    <div className={rootClasses}>
      <header
        className={`flex items-start justify-between gap-4 ${
          fullscreen ? "shrink-0" : "border-b border-zinc-200 pb-6 dark:border-zinc-800"
        }`}
      >
        <div>
          <h1
            className={
              fullscreen
                ? "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                : "text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            }
          >
            Mambo
          </h1>
          {!fullscreen && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Fill the grid with circles and squares — balanced lines, never three in a row,
              and every = and ✕ respected.
            </p>
          )}
        </div>
        <button
          type="button"
          className={`${SECONDARY_BUTTON_CLASSES} shrink-0`}
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? "✕ Exit full screen" : "⛶ Full screen"}
        </button>
      </header>

      <div className={layoutClasses}>
        <section className={panelClasses}>
          <div className="flex flex-col gap-3">
            <h2 className={sectionHeading}>Puzzle</h2>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Rows
                <select
                  value={rows}
                  onChange={(e) => resizeBoard(Number(e.target.value), cols)}
                  className={`${INPUT_CLASSES} w-20 px-2 py-1.5`}
                >
                  {SIDES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Cols
                <select
                  value={cols}
                  onChange={(e) => resizeBoard(rows, Number(e.target.value))}
                  className={`${INPUT_CLASSES} w-20 px-2 py-1.5`}
                >
                  {SIDES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Level
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as MamboDifficulty)}
                  className={`${INPUT_CLASSES} w-24 px-2 py-1.5`}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className={disabledPrimary}
              onClick={generate}
              disabled={generating}
            >
              {generating ? "🎯 Generating…" : "🎯 Generate puzzle"}
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={newBlankBoard}>
              New blank board
            </button>
            {generateStatus && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{generateStatus}</p>
            )}
            {generateError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                ⚠ {generateError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className={sectionHeading}>Board</h2>
            <div className="flex gap-2">
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={resetBoard}>
                ↺ Reset
              </button>
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={clearSigns}>
                Clear signs
              </button>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Click a cell to cycle empty → circle → square, and click a gap between cells to
              cycle its sign (none → = → ✕). Right-click a cell to go back.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {filled} / {rows * cols} filled
              {conflicts.messages.length > 0 && (
                <span className="font-medium text-red-600 dark:text-red-400">
                  {" "}
                  · {conflicts.messages.length} rule break
                  {conflicts.messages.length === 1 ? "" : "s"}
                </span>
              )}
            </p>
            {conflicts.messages.slice(0, 3).map((m) => (
              <p key={m} className="text-xs text-red-600 dark:text-red-400">
                ⚠ {m}
              </p>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className={sectionHeading}>Solve</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className={disabledPrimary}
                onClick={hint}
                disabled={busy !== null || complete}
              >
                {busy === "hint" ? "💡 Thinking…" : "💡 Hint"}
              </button>
              <button
                type="button"
                className={disabledSecondary}
                onClick={showSteps}
                disabled={busy !== null || complete}
              >
                {busy === "steps" ? "Walking…" : "🧠 Walk through"}
              </button>
            </div>
            <button
              type="button"
              className={disabledSecondary}
              onClick={revealSolution}
              disabled={busy !== null}
            >
              {busy === "solve" ? "Solving…" : "✅ Reveal solution"}
            </button>
            {solveStatus && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{solveStatus}</p>
            )}
            {solveError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">⚠ {solveError}</p>
            )}

            {steps && (
              <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={disabledSecondary}
                    onClick={stepPrev}
                    disabled={stepIndex <= 0}
                  >
                    ⏮ Prev
                  </button>
                  <button
                    type="button"
                    className={disabledSecondary}
                    onClick={stepNext}
                    disabled={stepIndex >= steps.length}
                  >
                    Next ⏭
                  </button>
                  <button
                    type="button"
                    className={disabledSecondary}
                    onClick={togglePlay}
                    disabled={!playing && stepIndex >= steps.length}
                  >
                    {playing ? "⏸ Pause" : "▶ Play"}
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Speed
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={speed}
                    onChange={(e) => onSpeedChange(Number(e.target.value))}
                    className="flex-1"
                  />
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Step {stepIndex} / {steps.length}
                </p>
                {nextStep ? (
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
                    <p className="font-semibold">
                      Next · {techniqueLabel(nextStep.technique)} → r{nextStep.r + 1}c
                      {nextStep.c + 1} is a {SYMBOL_LABELS[nextStep.value]}
                    </p>
                    <p className="mt-1">{nextStep.detail}</p>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Every forced cell has been filled.
                  </p>
                )}
                {lastStep && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Just placed: r{lastStep.r + 1}c{lastStep.c + 1} ={" "}
                    {SYMBOL_LABELS[lastStep.value]} ({techniqueLabel(lastStep.technique)})
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className={sectionHeading}>Puzzle code</h2>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={puzzleCode}
                className={`${INPUT_CLASSES} min-w-0 flex-1 px-2 py-1.5 text-xs`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={copyCode}>
                📋
              </button>
            </div>
            {copyFeedback && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{copyFeedback}</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="Paste a puzzle code"
                className={`${INPUT_CLASSES} min-w-0 flex-1 px-2 py-1.5 text-xs`}
              />
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={loadFromCode}>
                Load
              </button>
            </div>
            {codeError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">⚠ {codeError}</p>
            )}
          </div>

          {!fullscreen && (
            <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className={sectionHeading}>Rules</h2>
              <ul className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <li>· Never three of the same symbol in a row or column.</li>
                <li>· Every row and column holds as many circles as squares.</li>
                <li>· = between two cells means they match; ✕ means they differ.</li>
              </ul>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Two neighbours the same? Both outer cells take the other symbol. A gap between
                two matching symbols? It takes the other one. A line out of circles? The rest
                are squares.
              </p>
            </div>
          )}
        </section>

        <section className={boardSectionClasses}>
          {fullBoardWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {fullBoardWarning}
            </div>
          )}

          <div className="flex flex-col items-start rounded-xl bg-white p-3 shadow-sm">
            {colLabels}
            <div className="flex">
              {rowLabels}
              <div
                className="select-none"
                style={{
                  display: "grid",
                  gridTemplateColumns: colTemplate,
                  gridTemplateRows: rowTemplate,
                }}
              >
                {grid.map((row, r) =>
                  row.map((v, c) => {
                    const isClue = puzzle[r][c] !== EMPTY;
                    const bad = conflicts.cells.has(cellKey(r, c));
                    const isNext = nextStep != null && nextStep.r === r && nextStep.c === c;
                    const isLast = lastStep != null && lastStep.r === r && lastStep.c === c;
                    return (
                      <button
                        key={cellKey(r, c)}
                        type="button"
                        onClick={() => cycleCell(r, c, false)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          cycleCell(r, c, true);
                        }}
                        aria-label={`Row ${r + 1} column ${c + 1}: ${
                          v === EMPTY ? "empty" : SYMBOL_LABELS[v]
                        }${isClue ? " (clue)" : ""}`}
                        style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 1 }}
                        className={`flex items-center justify-center rounded-md border transition ${
                          isClue
                            ? "border-zinc-400 bg-zinc-100"
                            : "border-zinc-300 bg-white hover:bg-zinc-50"
                        } ${
                          bad ? "!border-red-500 bg-red-50 ring-2 ring-inset ring-red-500" : ""
                        } ${
                          isNext
                            ? "!border-emerald-500 ring-2 ring-inset ring-emerald-500"
                            : isLast
                              ? "!border-indigo-400 ring-2 ring-inset ring-indigo-400"
                              : ""
                        }`}
                      >
                        <SymbolMark value={v} faded={!isClue} />
                      </button>
                    );
                  }),
                )}

                {hSigns.map((row, r) =>
                  row.map((sign, c) => (
                    <SignSlot
                      key={`h-${r}-${c}`}
                      sign={sign}
                      bad={conflicts.hSigns.has(cellKey(r, c))}
                      gapPx={gapPx}
                      onClick={() => cycleSign("h", r, c)}
                      style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 2 }}
                      label={`Sign between row ${r + 1} column ${c + 1} and column ${c + 2}`}
                    />
                  )),
                )}
                {vSigns.map((row, r) =>
                  row.map((sign, c) => (
                    <SignSlot
                      key={`v-${r}-${c}`}
                      sign={sign}
                      bad={conflicts.vSigns.has(cellKey(r, c))}
                      gapPx={gapPx}
                      onClick={() => cycleSign("v", r, c)}
                      style={{ gridRow: 2 * r + 2, gridColumn: 2 * c + 1 }}
                      label={`Sign between column ${c + 1} row ${r + 1} and row ${r + 2}`}
                    />
                  )),
                )}
              </div>
              {rowLabels}
            </div>
            {colLabels}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-full"
                style={{ background: CIRCLE_COLOR }}
              />
              circle
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-[20%]"
                style={{ background: SQUARE_COLOR }}
              />
              square
            </span>
            <span>solid = clue, faded = solved</span>
            <span>= same · ✕ different</span>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The gap between two neighbouring cells, which holds their = or ✕ sign. */
function SignSlot({
  sign,
  bad,
  gapPx,
  onClick,
  style,
  label,
}: {
  sign: number;
  bad: boolean;
  gapPx: number;
  onClick: () => void;
  style: React.CSSProperties;
  label: string;
}) {
  const glyph = SIGN_GLYPHS[sign];
  const fontSize = Math.max(8, Math.round(gapPx * 0.95));
  const classes = `flex items-center justify-center leading-none ${
    bad
      ? "font-bold text-red-600"
      : sign === SIGN_NONE
        ? "text-zinc-300"
        : "font-bold text-zinc-900"
  }`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Click to cycle: none → = → ✕"
      style={{ ...style, fontSize }}
      className={`${classes} rounded hover:bg-indigo-100`}
    >
      {glyph || "·"}
    </button>
  );
}
