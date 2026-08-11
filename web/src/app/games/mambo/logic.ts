/**
 * Mambo (a.k.a. Takuzu / Binairo) grid mechanics.
 *
 * Rules:
 *   - Every cell holds one of two symbols: a circle or a square.
 *   - No three identical symbols consecutively in any row or column.
 *   - Each row and column holds equally many of each symbol, so both sides
 *     must be even.
 *   - An "=" between two neighbouring cells means they match; an "✕" means
 *     they differ.
 *
 * There is no "every row must be distinct" rule — that belongs to other
 * Binairo variants, not to Mambo.
 *
 * This module only holds the rules a keystroke needs: editing cells, spotting
 * broken rules, and serialising a board. Solving, hinting and generating run
 * server-side (see backend/app/services/mambo_solver.py) so a big board never
 * blocks the main thread.
 */

export const EMPTY = -1;
export const CIRCLE = 0;
export const SQUARE = 1;

export const SIGN_NONE = 0;
export const SIGN_EQUAL = 1;
export const SIGN_OPPOSITE = 2;

export type Grid = number[][];
/** Signs between horizontal neighbours: rows x (cols - 1). Vertical: (rows - 1) x cols. */
export type SignGrid = number[][];

export const MIN_SIDE = 4;
export const MAX_SIDE = 16;

export const SYMBOL_LABELS = ["circle", "square"] as const;
export const SIGN_GLYPHS = ["", "=", "✕"] as const;

export function cellKey(r: number, c: number): string {
  return `${r}-${c}`;
}

export function emptyGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => new Array(cols).fill(EMPTY));
}

export function emptyHSigns(rows: number, cols: number): SignGrid {
  return Array.from({ length: rows }, () => new Array(cols - 1).fill(SIGN_NONE));
}

export function emptyVSigns(rows: number, cols: number): SignGrid {
  return Array.from({ length: rows - 1 }, () => new Array(cols).fill(SIGN_NONE));
}

export function cloneGrid(g: Grid): Grid {
  return g.map((row) => row.slice());
}

/** Cell cycle used by clicking: empty → circle → square → empty. */
export function nextValue(v: number): number {
  return v === EMPTY ? CIRCLE : v === CIRCLE ? SQUARE : EMPTY;
}

/** The same cycle backwards, for right-click. */
export function prevValue(v: number): number {
  return v === EMPTY ? SQUARE : v === SQUARE ? CIRCLE : EMPTY;
}

/** Sign cycle used by clicking a gap: none → = → ✕ → none. */
export function nextSign(s: number): number {
  return s === SIGN_NONE ? SIGN_EQUAL : s === SIGN_EQUAL ? SIGN_OPPOSITE : SIGN_NONE;
}

export function countFilled(grid: Grid): number {
  let n = 0;
  for (const row of grid) for (const v of row) if (v !== EMPTY) n++;
  return n;
}

export function isComplete(grid: Grid): boolean {
  for (const row of grid) for (const v of row) if (v === EMPTY) return false;
  return true;
}

/** Cells and signs currently breaking a rule, keyed `${r}-${c}`. */
export interface Conflicts {
  cells: Set<string>;
  hSigns: Set<string>;
  vSigns: Set<string>;
  /** One line per distinct problem, for showing the player what's wrong. */
  messages: string[];
}

function lineLabel(kind: "row" | "col", index: number): string {
  return `${kind === "row" ? "Row" : "Column"} ${index + 1}`;
}

/**
 * Every rule violation among the *filled* cells. Deliberately says nothing
 * about whether the board can still be finished — that's the solver's job.
 */
export function findConflicts(grid: Grid, hSigns: SignGrid, vSigns: SignGrid): Conflicts {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const cells = new Set<string>();
  const hSet = new Set<string>();
  const vSet = new Set<string>();
  const messages: string[] = [];

  const flagTriple = (a: [number, number], b: [number, number], c: [number, number]) => {
    for (const [r, cc] of [a, b, c]) cells.add(cellKey(r, cc));
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c + 2 < cols; c++) {
      const v = grid[r][c];
      if (v !== EMPTY && v === grid[r][c + 1] && v === grid[r][c + 2]) {
        flagTriple([r, c], [r, c + 1], [r, c + 2]);
        messages.push(`Three ${SYMBOL_LABELS[v]}s in a row at r${r + 1}c${c + 1}.`);
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r + 2 < rows; r++) {
      const v = grid[r][c];
      if (v !== EMPTY && v === grid[r + 1][c] && v === grid[r + 2][c]) {
        flagTriple([r, c], [r + 1, c], [r + 2, c]);
        messages.push(`Three ${SYMBOL_LABELS[v]}s in a column at r${r + 1}c${c + 1}.`);
      }
    }
  }

  const checkCounts = (
    kind: "row" | "col",
    index: number,
    coords: readonly [number, number][],
  ) => {
    const half = coords.length / 2;
    for (const symbol of [CIRCLE, SQUARE]) {
      const hits = coords.filter(([r, c]) => grid[r][c] === symbol);
      if (hits.length > half) {
        for (const [r, c] of hits) cells.add(cellKey(r, c));
        messages.push(
          `${lineLabel(kind, index)} has ${hits.length} ${SYMBOL_LABELS[symbol]}s — only ${half} fit.`,
        );
      }
    }
  };

  for (let r = 0; r < rows; r++) {
    checkCounts(
      "row",
      r,
      Array.from({ length: cols }, (_, c) => [r, c] as [number, number]),
    );
  }
  for (let c = 0; c < cols; c++) {
    checkCounts(
      "col",
      c,
      Array.from({ length: rows }, (_, r) => [r, c] as [number, number]),
    );
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const sign = hSigns[r][c];
      if (sign === SIGN_NONE) continue;
      const a = grid[r][c];
      const b = grid[r][c + 1];
      if (a === EMPTY || b === EMPTY) continue;
      if ((a === b) !== (sign === SIGN_EQUAL)) {
        hSet.add(cellKey(r, c));
        cells.add(cellKey(r, c));
        cells.add(cellKey(r, c + 1));
        messages.push(
          `The ${SIGN_GLYPHS[sign]} between r${r + 1}c${c + 1} and r${r + 1}c${c + 2} is broken.`,
        );
      }
    }
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sign = vSigns[r][c];
      if (sign === SIGN_NONE) continue;
      const a = grid[r][c];
      const b = grid[r + 1][c];
      if (a === EMPTY || b === EMPTY) continue;
      if ((a === b) !== (sign === SIGN_EQUAL)) {
        vSet.add(cellKey(r, c));
        cells.add(cellKey(r, c));
        cells.add(cellKey(r + 1, c));
        messages.push(
          `The ${SIGN_GLYPHS[sign]} between r${r + 1}c${c + 1} and r${r + 2}c${c + 1} is broken.`,
        );
      }
    }
  }

  return { cells, hSigns: hSet, vSigns: vSet, messages };
}

/** Circles and squares placed so far in a row, for the on-board tallies. */
export function rowCounts(grid: Grid, r: number): [number, number] {
  let circles = 0;
  let squares = 0;
  for (const v of grid[r]) {
    if (v === CIRCLE) circles++;
    else if (v === SQUARE) squares++;
  }
  return [circles, squares];
}

export function colCounts(grid: Grid, c: number): [number, number] {
  let circles = 0;
  let squares = 0;
  for (const row of grid) {
    if (row[c] === CIRCLE) circles++;
    else if (row[c] === SQUARE) squares++;
  }
  return [circles, squares];
}

// ---- puzzle codes (copy/paste a puzzle, signs included) ----

const CELL_CHARS = ".os";
const SIGN_CHARS = ".=x";
const CODE_RE = /^(\d+)x(\d+):([.os]+):([.=x]*):([.=x]*)$/i;

/**
 * Serialises a puzzle — the given clues plus every sign — into a short string
 * the player can copy and later restore with `decodePuzzle`. Only the clues
 * are stored, so pasting a code always yields a fresh, unsolved puzzle.
 */
export function encodePuzzle(grid: Grid, hSigns: SignGrid, vSigns: SignGrid): string {
  const rows = grid.length;
  const cols = grid[0].length;
  let cells = "";
  for (const row of grid) {
    for (const v of row) cells += v === EMPTY ? "." : CELL_CHARS[v + 1];
  }
  let h = "";
  for (const row of hSigns) for (const s of row) h += SIGN_CHARS[s];
  let v = "";
  for (const row of vSigns) for (const s of row) v += SIGN_CHARS[s];
  return `${rows}x${cols}:${cells}:${h}:${v}`;
}

export function decodePuzzle(
  code: string,
): { grid: Grid; hSigns: SignGrid; vSigns: SignGrid } | null {
  const m = CODE_RE.exec(code.trim());
  if (!m) return null;
  const rows = parseInt(m[1], 10);
  const cols = parseInt(m[2], 10);
  if (rows < MIN_SIDE || cols < MIN_SIDE || rows > MAX_SIDE || cols > MAX_SIDE) return null;
  if (rows % 2 !== 0 || cols % 2 !== 0) return null;
  const cells = m[3].toLowerCase();
  const h = m[4].toLowerCase();
  const v = m[5].toLowerCase();
  if (cells.length !== rows * cols) return null;
  if (h.length !== rows * (cols - 1) || v.length !== (rows - 1) * cols) return null;

  const grid: Grid = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(CELL_CHARS.indexOf(cells[r * cols + c]) - 1);
    }
    grid.push(row);
  }
  const hSigns: SignGrid = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols - 1; c++) row.push(SIGN_CHARS.indexOf(h[r * (cols - 1) + c]));
    hSigns.push(row);
  }
  const vSigns: SignGrid = [];
  for (let r = 0; r < rows - 1; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) row.push(SIGN_CHARS.indexOf(v[r * cols + c]));
    vSigns.push(row);
  }
  return { grid, hSigns, vSigns };
}
