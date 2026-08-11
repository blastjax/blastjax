"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CARD_CLASSES,
  INPUT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";
import {
  generateMosaicPuzzle,
  solveMosaic,
  solveMosaicBestStart,
  solveMosaicFree,
} from "@/lib/api";
import { applyMove, decodeBoard, encodeBoard, type Cell, type Grid } from "./solver";

const PALETTE = [
  "#e15b5b", // red
  "#5b8ee1", // blue
  "#6fd1a5", // mint
  "#9b6fd1", // purple
  "#3f3f52", // navy
  "#e1c15b", // yellow
  "#e18ab0", // pink
  "#5be1d1", // teal
];

const BLANK = -1;
const MAX_BOARD_PX = 560;
/** Reserved space around the board in full-screen mode: the fixed-width
 * side panel (+ gaps/padding) horizontally, the compact header + palette
 * row vertically. */
const ROW_LABEL_W = 26;
const COL_LABEL_H = 20;
const FULLSCREEN_RESERVE_W = 360 + 2 * ROW_LABEL_W;
const FULLSCREEN_RESERVE_H = 190 + 2 * COL_LABEL_H;

const LABEL_CLASSES =
  "flex items-center justify-center overflow-hidden text-[10px] font-medium text-zinc-500 dark:text-zinc-400";

type Mode = "paint" | "seed";
type Solving = "solve" | "findBest" | "free" | null;

/** One step of a solution: repaint the blob at (r, c) to `color`. For
 * fixed-start solves every move carries the start tile; for free-cell
 * solves each move can target a different tile. */
type SolutionMove = { r: number; c: number; color: number };

interface SolutionState {
  moves: SolutionMove[];
  optimal: boolean;
  ms: number;
  regionsTried?: number;
  totalRegions?: number;
  /** True when the moves may each target a different tile. */
  freeCell?: boolean;
}

/** Lifts a fixed-start solution (a list of colors) into SolutionMove[]. */
function movesFromColors(colors: number[], seed: Cell): SolutionMove[] {
  return colors.map((color) => ({ r: seed.r, c: seed.c, color }));
}

function blankGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => new Array(cols).fill(BLANK));
}

function randomGrid(rows: number, cols: number, numColors: number): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(Math.random() * numColors)),
  );
}

function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function countBlank(grid: Grid): number {
  let n = 0;
  for (const row of grid) for (const v of row) if (v === BLANK) n++;
  return n;
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

export default function MosaicClient() {
  const [rowsStr, setRowsStr] = useState("8");
  const [colsStr, setColsStr] = useState("8");
  const [colorsStr, setColorsStr] = useState("4");

  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(8);
  const [colors, setColors] = useState<string[]>(PALETTE.slice(0, 4));

  const [grid, setGrid] = useState<Grid>(() => blankGrid(8, 8));
  const [originalGrid, setOriginalGrid] = useState<Grid>(() => blankGrid(8, 8));
  const [seed, setSeed] = useState<Cell>({ r: 0, c: 0 });

  const [mode, setMode] = useState<Mode>("paint");
  const [paintColor, setPaintColor] = useState(0);

  const [solution, setSolution] = useState<SolutionState | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Grid[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [solving, setSolving] = useState<Solving>(null);

  const [targetMovesStr, setTargetMovesStr] = useState("6");
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const windowSize = useWindowSize();

  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mouseDownRef = useRef(false);

  useEffect(() => {
    const down = () => {
      mouseDownRef.current = true;
    };
    const up = () => {
      mouseDownRef.current = false;
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);

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

  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, []);

  const blankCount = useMemo(() => countBlank(grid), [grid]);
  const painted = blankCount === 0;

  const targetMoves = parseInt(targetMovesStr, 10);
  const hasValidTarget = Number.isFinite(targetMoves) && targetMoves > 0;

  const currentCode = useMemo(
    () => (painted ? encodeBoard(grid, colors.length, seed) : null),
    [grid, colors.length, seed, painted],
  );

  function stopPlaying() {
    setPlaying(false);
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
  }

  function invalidateSolution() {
    setSolution(null);
    setSnapshots(null);
    setStepIndex(0);
    setSolveError(null);
  }

  function newBoard() {
    stopPlaying();
    const r = clamp(parseInt(rowsStr, 10) || 8, 2, 40);
    const c = clamp(parseInt(colsStr, 10) || 8, 2, 40);
    const n = clamp(parseInt(colorsStr, 10) || 4, 2, PALETTE.length);
    setRowsStr(String(r));
    setColsStr(String(c));
    setColorsStr(String(n));
    setRows(r);
    setCols(c);
    setColors(PALETTE.slice(0, n));
    const blank = blankGrid(r, c);
    setGrid(blank);
    setOriginalGrid(cloneGrid(blank));
    setSeed({ r: 0, c: 0 });
    setPaintColor(0);
    setMode("paint");
    invalidateSolution();
  }

  function randomFill() {
    stopPlaying();
    const g = randomGrid(rows, cols, colors.length);
    setGrid(g);
    setOriginalGrid(cloneGrid(g));
    invalidateSolution();
  }

  function paintCell(r: number, c: number) {
    setGrid((prev) => {
      if (prev[r][c] === paintColor) return prev;
      const next = prev.map((row) => row.slice());
      next[r][c] = paintColor;
      setOriginalGrid(next.map((row) => row.slice()));
      return next;
    });
    invalidateSolution();
  }

  function onCellInteract(r: number, c: number, isDown: boolean) {
    if (mode === "seed") {
      if (!isDown) return;
      setSeed({ r, c });
      setMode("paint");
      return;
    }
    if (mode === "paint") {
      if (!isDown && !mouseDownRef.current) return;
      paintCell(r, c);
    }
  }

  function onPaletteClick(idx: number) {
    if (mode !== "paint") return;
    setPaintColor(idx);
  }

  function togglePaint() {
    setMode("paint");
  }

  /** Recolors a palette slot, cycling to the next hue in PALETTE that isn't
   * already showing on another slot (so no two swatches end up identical). */
  function cyclePaletteColor(idx: number) {
    setColors((prev) => {
      const next = prev.slice();
      let i = PALETTE.indexOf(prev[idx]);
      for (let step = 0; step < PALETTE.length; step++) {
        i = (i + 1) % PALETTE.length;
        if (!prev.some((c, j) => j !== idx && c === PALETTE[i])) {
          next[idx] = PALETTE[i];
          break;
        }
      }
      return next;
    });
  }

  function toggleSeed() {
    setMode("seed");
  }

  function resetPuzzle() {
    stopPlaying();
    const g = cloneGrid(originalGrid);
    setGrid(g);
    setStepIndex(0);
    setSnapshots(solution ? [cloneGrid(g)] : null);
  }

  async function solveFromSeed() {
    if (!painted) return;
    stopPlaying();
    setSolving("solve");
    setSolveError(null);
    // With a target set, cap the backend search at that length: it then
    // fails fast the moment no solution of that length exists, instead of
    // continuing on to find the (possibly much larger) true optimum.
    const cap = hasValidTarget ? targetMoves : undefined;
    const t0 = performance.now();
    try {
      const result = await solveMosaic(grid, seed, 3000, cap);
      const ms = Math.round(performance.now() - t0);
      if (cap != null && result.moves.length === 0 && !result.optimal) {
        setSolution(null);
        setSnapshots(null);
        setStepIndex(0);
        setSolveError(
          result.proven
            ? `Not solvable within ${cap} move${cap === 1 ? "" : "s"} from this start (proven — ${ms}ms).`
            : `Timed out before determining whether ${cap} move${cap === 1 ? "" : "s"} suffice — try again.`,
        );
        return;
      }
      setSolution({
        moves: movesFromColors(result.moves, seed),
        optimal: result.optimal,
        ms,
      });
      setSnapshots([cloneGrid(grid)]);
      setStepIndex(0);
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : "Solve failed.");
    } finally {
      setSolving(null);
    }
  }

  /** Solve under the "tap any tile" rule — each move may repaint a different
   * blob, which yields far shorter solutions than a fixed start tile. */
  async function solveFreeCell() {
    if (!painted) return;
    stopPlaying();
    setSolving("free");
    setSolveError(null);
    const cap = hasValidTarget ? targetMoves : undefined;
    const t0 = performance.now();
    try {
      const result = await solveMosaicFree(grid, colors.length, 8000, cap);
      const ms = Math.round(performance.now() - t0);
      if (result.moves.length === 0 && !result.optimal) {
        setSolution(null);
        setSnapshots(null);
        setStepIndex(0);
        setSolveError(
          !result.proven
            ? "Timed out before finding a solution — try again."
            : cap != null
              ? `Not solvable within ${cap} move${cap === 1 ? "" : "s"}, even tapping any tile (proven — ${ms}ms).`
              : "No solution found.",
        );
        return;
      }
      setSolution({
        moves: result.moves,
        optimal: result.optimal,
        ms,
        freeCell: true,
      });
      setSnapshots([cloneGrid(grid)]);
      setStepIndex(0);
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : "Solve failed.");
    } finally {
      setSolving(null);
    }
  }

  async function findBestStartAndSolve() {
    if (!painted) return;
    stopPlaying();
    setSolving("findBest");
    setSolveError(null);
    const t0 = performance.now();
    try {
      const result = await solveMosaicBestStart(grid, 5000);
      const ms = Math.round(performance.now() - t0);
      setSeed(result.seed);
      setSolution({
        moves: movesFromColors(result.moves, result.seed),
        optimal: result.optimal,
        ms,
        regionsTried: result.regionsTried,
        totalRegions: result.totalRegions,
      });
      setSnapshots([cloneGrid(grid)]);
      setStepIndex(0);
    } catch (err) {
      setSolveError(err instanceof Error ? err.message : "Solve failed.");
    } finally {
      setSolving(null);
    }
  }

  async function generatePuzzle() {
    stopPlaying();
    const target = clamp(parseInt(targetMovesStr, 10) || 1, 1, 200);
    setTargetMovesStr(String(target));
    setGenerating(true);
    setGenerateError(null);
    setGenerateStatus(null);
    try {
      const result = await generateMosaicPuzzle(rows, cols, colors.length, target, 8000);
      setGrid(result.grid);
      setOriginalGrid(cloneGrid(result.grid));
      setSeed(result.seed);
      setSolveError(null);
      setSolution({
        moves: movesFromColors(result.moves, result.seed),
        optimal: result.optimal,
        ms: 0,
      });
      setSnapshots([cloneGrid(result.grid)]);
      setStepIndex(0);
      setGenerateStatus(
        result.exactMatch
          ? `Generated in ${result.attempts} attempt${result.attempts === 1 ? "" : "s"} — needs exactly ${result.moves.length} move${result.moves.length === 1 ? "" : "s"}.`
          : `Closest found after ${result.attempts} attempts: ${result.moves.length} move${result.moves.length === 1 ? "" : "s"} (target was ${target}).`,
      );
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generate failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyCurrentCode() {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopyFeedback("Copied!");
    } catch {
      setCopyFeedback("Couldn't copy — select the text and copy manually.");
    }
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  function loadFromCode() {
    const decoded = decodeBoard(codeInput);
    if (!decoded) {
      setCodeError("That code doesn't look valid.");
      return;
    }
    const { grid: g, numColors, seed: s } = decoded;
    if (numColors < 2 || numColors > PALETTE.length) {
      setCodeError(`Board codes must use between 2 and ${PALETTE.length} colors.`);
      return;
    }
    if (g.length < 2 || g.length > 40 || g[0].length < 2 || g[0].length > 40) {
      setCodeError("Board dimensions in that code are out of range.");
      return;
    }
    stopPlaying();
    setRowsStr(String(g.length));
    setColsStr(String(g[0].length));
    setColorsStr(String(numColors));
    setRows(g.length);
    setCols(g[0].length);
    setColors(PALETTE.slice(0, numColors));
    setGrid(g);
    setOriginalGrid(cloneGrid(g));
    setSeed(s);
    setMode("paint");
    invalidateSolution();
    setCodeError(null);
    setGenerateStatus(null);
  }

  function stepNext() {
    if (!solution || stepIndex >= solution.moves.length) return;
    const move = solution.moves[stepIndex];
    const newIndex = stepIndex + 1;
    const existingSnapshots = snapshots ?? [cloneGrid(grid)];
    const newSnapshots = [...existingSnapshots];
    let newGrid: Grid;
    if (newSnapshots[newIndex]) {
      newGrid = cloneGrid(newSnapshots[newIndex]);
    } else {
      newGrid = applyMove(grid, { r: move.r, c: move.c }, move.color).grid;
      newSnapshots[newIndex] = cloneGrid(newGrid);
    }
    setGrid(newGrid);
    setSnapshots(newSnapshots);
    setStepIndex(newIndex);
  }

  function stepPrev() {
    if (!solution || stepIndex <= 0 || !snapshots) return;
    const newIndex = stepIndex - 1;
    setGrid(cloneGrid(snapshots[newIndex]));
    setStepIndex(newIndex);
  }

  const stepNextLatest = useLatest(stepNext);

  function startPlaying(speedValue: number) {
    setPlaying(true);
    const delay = Math.max(150, 1100 - speedValue * 100);
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = setInterval(() => stepNextLatest.current(), delay);
  }

  function togglePlay() {
    if (!solution) return;
    if (playing) {
      stopPlaying();
      return;
    }
    startPlaying(speed);
  }

  function onSpeedChange(v: number) {
    setSpeed(v);
    if (playing) startPlaying(v);
  }

  const cellPx = useMemo(() => {
    let boardPx = MAX_BOARD_PX;
    if (fullscreen && windowSize.width > 0) {
      const availW = windowSize.width - FULLSCREEN_RESERVE_W;
      const availH = windowSize.height - FULLSCREEN_RESERVE_H;
      boardPx = Math.max(240, Math.min(availW, availH));
    }
    return Math.max(6, Math.floor(boardPx / Math.max(rows, cols)));
  }, [rows, cols, fullscreen, windowSize]);

  const modeLabel =
    mode === "paint"
      ? "Paint mode: pick a color, then click/drag tiles to draw the board."
      : "Click a tile to set the start tile.";

  /** The move the solution wants next, if any — drives the palette hint and
   * (for free-cell solutions) the target-tile marker on the board. */
  const nextMove =
    solution && stepIndex < solution.moves.length ? solution.moves[stepIndex] : null;

  const solveStatusText = solution
    ? `${
        solution.freeCell
          ? "Tap-any-tile"
          : `Start: row ${seed.r + 1}, col ${seed.c + 1}`
      } · Solution: ${solution.moves.length} move${
        solution.moves.length === 1 ? "" : "s"
      } (${solution.optimal ? "optimal" : "best found"})${
        solution.regionsTried != null
          ? ` (checked ${solution.regionsTried}/${solution.totalRegions} start tiles)`
          : ""
      } · ${solution.ms}ms`
    : "";

  const nextMoveHint =
    solution?.freeCell && nextMove
      ? `Next: tap row ${nextMove.r + 1}, col ${nextMove.c + 1} (ringed on the board).`
      : "";

  const targetCheck = (() => {
    if (!solution || !hasValidTarget) return null;
    const passed = solution.moves.length <= targetMoves;
    return {
      passed,
      text: passed
        ? `✅ Solvable within target — ${solution.moves.length}/${targetMoves} moves.`
        : `⚠ Exceeds target — needs ${solution.moves.length} moves (target ${targetMoves}).`,
    };
  })();

  const stepLabelText = solution ? `Move ${stepIndex} / ${solution.moves.length}` : "";

  const disabledSecondary = `${SECONDARY_BUTTON_CLASSES} disabled:cursor-not-allowed disabled:opacity-50`;

  /** Edge labels, rendered on both sides of each axis so a row or column's
   * number is reachable from whichever end you're reading from. */
  const colLabels = (
    <div className="flex" style={{ paddingLeft: ROW_LABEL_W }}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} style={{ width: cellPx, height: COL_LABEL_H }} className={LABEL_CLASSES}>
          {c + 1}
        </div>
      ))}
    </div>
  );
  const rowLabels = (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ width: ROW_LABEL_W, height: cellPx }} className={LABEL_CLASSES}>
          {r + 1}
        </div>
      ))}
    </div>
  );

  const rootClasses = fullscreen
    ? "fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col gap-3 overflow-hidden bg-[var(--background)] p-3"
    : "box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8";

  const layoutClasses = fullscreen
    ? "flex min-h-0 flex-1 flex-nowrap items-start gap-4 overflow-hidden"
    : "flex flex-wrap items-start gap-6";

  const panelClasses = fullscreen
    ? `${CARD_CLASSES} h-full w-72 shrink-0 flex flex-col gap-5 overflow-y-auto`
    : `${CARD_CLASSES} w-full max-w-xs shrink-0 flex flex-col gap-5`;

  const boardSectionClasses = fullscreen
    ? "flex h-full min-h-0 flex-1 min-w-0 flex-col items-center justify-center gap-5 overflow-auto"
    : "flex flex-1 min-w-0 flex-col items-center gap-5";

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
            Mosaic
          </h1>
          {!fullscreen && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Flood-fill puzzle editor &amp; step-by-step optimal solver.
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Board
            </h2>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Rows
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={rowsStr}
                  onChange={(e) => setRowsStr(e.target.value)}
                  className={`${INPUT_CLASSES} w-16 px-2 py-1.5`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Cols
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={colsStr}
                  onChange={(e) => setColsStr(e.target.value)}
                  className={`${INPUT_CLASSES} w-16 px-2 py-1.5`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Colors
                <input
                  type="number"
                  min={2}
                  max={PALETTE.length}
                  value={colorsStr}
                  onChange={(e) => setColorsStr(e.target.value)}
                  className={`${INPUT_CLASSES} w-16 px-2 py-1.5`}
                />
              </label>
            </div>
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={newBoard}>
              New blank board
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={randomFill}>
              🎲 Random fill
            </button>
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Edit
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                className={mode === "paint" ? PRIMARY_BUTTON_CLASSES : SECONDARY_BUTTON_CLASSES}
                onClick={togglePaint}
              >
                🖌 Paint tiles
              </button>
              <button
                type="button"
                className={mode === "seed" ? PRIMARY_BUTTON_CLASSES : SECONDARY_BUTTON_CLASSES}
                onClick={toggleSeed}
              >
                📍 Set start
              </button>
            </div>
            <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={resetPuzzle}>
              ↺ Reset
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{modeLabel}</p>
            {!painted && (
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                🖌 {blankCount} tile{blankCount === 1 ? "" : "s"} left to paint before you can
                solve.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Puzzle code
            </h2>
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              Target min. moves
              <input
                type="number"
                min={1}
                max={200}
                value={targetMovesStr}
                onChange={(e) => setTargetMovesStr(e.target.value)}
                className={`${INPUT_CLASSES} w-20 px-2 py-1.5`}
              />
            </label>
            <button
              type="button"
              className={disabledSecondary}
              onClick={generatePuzzle}
              disabled={generating}
            >
              {generating ? "🎯 Generating…" : "🎯 Generate puzzle"}
            </button>
            {generateStatus && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{generateStatus}</p>
            )}
            {generateError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                ⚠ {generateError}
              </p>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={currentCode ?? ""}
                placeholder="Paint or generate a board to get a code"
                className={`${INPUT_CLASSES} flex-1 px-2 py-1.5 text-xs`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className={disabledSecondary}
                onClick={copyCurrentCode}
                disabled={!currentCode}
              >
                📋 Copy
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
                placeholder="Paste a board code"
                className={`${INPUT_CLASSES} flex-1 px-2 py-1.5 text-xs`}
              />
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={loadFromCode}>
                Load
              </button>
            </div>
            {codeError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">⚠ {codeError}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Solve
            </h2>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASSES}
              onClick={findBestStartAndSolve}
              disabled={!painted || solving !== null}
            >
              {solving === "findBest" ? "🔍 Searching…" : "🔍 Find optimal start & solve"}
            </button>
            <button
              type="button"
              className={disabledSecondary}
              onClick={solveFreeCell}
              disabled={!painted || solving !== null}
              title="Each move repaints whichever blob you tap — usually far fewer moves than a fixed start tile."
            >
              {solving === "free" ? "👆 Solving…" : "👆 Solve (tap any tile)"}
            </button>
            <button
              type="button"
              className={disabledSecondary}
              onClick={solveFromSeed}
              disabled={!painted || solving !== null}
            >
              {solving === "solve" ? "Solving…" : "Solve from marked start"}
            </button>
            {solveStatusText && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{solveStatusText}</p>
            )}
            {nextMoveHint && (
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {nextMoveHint}
              </p>
            )}
            {solveError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                ⚠ {solveError}
              </p>
            )}
            {targetCheck && (
              <p
                className={`text-xs font-medium ${
                  targetCheck.passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {targetCheck.text}
              </p>
            )}

            {solution && (
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
                    disabled={stepIndex >= solution.moves.length}
                  >
                    Next ⏭
                  </button>
                  <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={togglePlay}>
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
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{stepLabelText}</p>
              </div>
            )}
          </div>
        </section>

        <section className={boardSectionClasses}>
          <div className="flex flex-col items-start">
            {colLabels}
            <div className="flex">
              {rowLabels}
              <div
                className="select-none overflow-hidden rounded-xl border-[3px] border-zinc-900 shadow-lg dark:border-zinc-100"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
                  gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
                  width: cellPx * cols,
                  height: cellPx * rows,
                }}
              >
                {grid.map((row, r) =>
                  row.map((v, c) => {
                    const isSeed = r === seed.r && c === seed.c;
                    // For a tap-any-tile solution, ring the tile the next
                    // move targets — otherwise the player can't tell where
                    // to tap.
                    const isNextTarget =
                      solution?.freeCell === true &&
                      nextMove != null &&
                      nextMove.r === r &&
                      nextMove.c === c;
                    // Region boundaries (edges between two different colors)
                    // get a solid black line; edges between same-colored
                    // cells stay on the faint default grid line, so painted
                    // blobs read as single shapes.
                    const diffAbove = r > 0 && grid[r - 1][c] !== v;
                    const diffLeft = c > 0 && grid[r][c - 1] !== v;
                    const diffBelow = r < rows - 1 && grid[r + 1][c] !== v;
                    const diffRight = c < cols - 1 && grid[r][c + 1] !== v;
                    return (
                      <div
                        key={`${r}-${c}`}
                        onMouseDown={() => onCellInteract(r, c, true)}
                        onMouseEnter={() => onCellInteract(r, c, false)}
                        className={`relative cursor-pointer border border-black/10 ${
                          v === BLANK ? "bg-white" : ""
                        }`}
                        style={{
                          ...(v === BLANK ? undefined : { background: colors[v] }),
                          borderTopColor: diffAbove ? "#000" : undefined,
                          borderLeftColor: diffLeft ? "#000" : undefined,
                          borderBottomColor: diffBelow ? "#000" : undefined,
                          borderRightColor: diffRight ? "#000" : undefined,
                        }}
                      >
                        {isSeed && (
                          <span className="absolute left-1/2 top-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/40 bg-white/85" />
                        )}
                        {isNextTarget && (
                          <span
                            className="pointer-events-none absolute inset-0 animate-pulse ring-[3px] ring-inset ring-white"
                            style={{ boxShadow: "inset 0 0 0 3px #000" }}
                          />
                        )}
                      </div>
                    );
                  }),
                )}
              </div>
              {rowLabels}
            </div>
            {colLabels}
          </div>

          <div className="flex gap-2.5">
            {mode === "paint" && (
              <button
                type="button"
                title="Erase"
                onClick={() => onPaletteClick(BLANK)}
                className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-white text-lg text-zinc-500 shadow transition hover:-translate-y-0.5 dark:border-zinc-600 dark:bg-zinc-900 ${
                  paintColor === BLANK ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""
                }`}
              >
                ✕
              </button>
            )}
            {colors.map((color, idx) => {
              const active = mode === "paint" && paintColor === idx;
              const suggested = mode !== "paint" && nextMove != null && nextMove.color === idx;
              const disabled = mode !== "paint";
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabled}
                  title={mode === "paint" ? "Click to paint · double-click to change this color" : undefined}
                  onClick={() => onPaletteClick(idx)}
                  onDoubleClick={
                    mode === "paint" ? () => cyclePaletteColor(idx) : undefined
                  }
                  className={`h-12 w-12 rounded-xl shadow transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 ${
                    active
                      ? "ring-2 ring-zinc-900 dark:ring-zinc-100"
                      : suggested
                        ? "ring-2 ring-emerald-600 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
                        : ""
                  }`}
                  style={{ background: color }}
                />
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
