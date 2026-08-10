/**
 * Mosaic / Flood-It grid mechanics.
 *
 * Rules: there is a fixed start tile ("seed"). A move picks a color c. The
 * connected blob of tiles reachable from the seed (all same current color)
 * is repainted to c, which makes it contiguous with any neighboring tiles
 * that already happen to be color c, so the blob grows. Goal: repaint the
 * whole board to one color in as few moves as possible.
 *
 * Finding the optimal sequence of moves is done server-side (IDA* search
 * over a region graph — see backend/app/services/mosaic_solver.py); this
 * module only applies moves and renders the board.
 */

export type Grid = number[][];
export type Cell = { r: number; c: number };

const DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function floodFillCells(grid: Grid, r0: number, c0: number): Cell[] {
  const rows = grid.length,
    cols = grid[0].length;
  const target = grid[r0][c0];
  const seen = new Uint8Array(rows * cols);
  const stack = [r0 * cols + c0];
  seen[r0 * cols + c0] = 1;
  const cells: Cell[] = [];
  while (stack.length) {
    const idx = stack.pop() as number;
    const r = (idx / cols) | 0,
      c = idx % cols;
    cells.push({ r, c });
    for (const [dr, dc] of DIRS) {
      const nr = r + dr,
        nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nidx = nr * cols + nc;
      if (seen[nidx]) continue;
      if (grid[nr][nc] !== target) continue;
      seen[nidx] = 1;
      stack.push(nidx);
    }
  }
  return cells;
}

export function applyMove(
  grid: Grid,
  seed: Cell,
  newColor: number,
): { grid: Grid; changed: boolean } {
  const oldColor = grid[seed.r][seed.c];
  if (oldColor === newColor) return { grid, changed: false };
  const cells = floodFillCells(grid, seed.r, seed.c);
  const g = grid.map((row) => row.slice());
  for (const { r, c } of cells) g[r][c] = newColor;
  return { grid: g, changed: true };
}

export function isSolved(grid: Grid): boolean {
  const first = grid[0][0];
  for (const row of grid) for (const v of row) if (v !== first) return false;
  return true;
}

// ---- board codes (copy/paste a board + start tile without repainting) ----

const CODE_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const CODE_RE = /^(\d+)x(\d+)x(\d+):([0-9a-z.]+):(\d+)-(\d+)$/i;

/** Serializes a board (including blank/-1 cells) and its start tile into a
 * short string the player can copy and later restore with `decodeBoard`. */
export function encodeBoard(grid: Grid, numColors: number, seed: Cell): string {
  const rows = grid.length;
  const cols = grid[0].length;
  let cells = "";
  for (const row of grid) {
    for (const v of row) {
      cells += v < 0 ? "." : CODE_CHARS[v];
    }
  }
  return `${rows}x${cols}x${numColors}:${cells}:${seed.r}-${seed.c}`;
}

export function decodeBoard(
  code: string,
): { grid: Grid; numColors: number; seed: Cell } | null {
  const m = CODE_RE.exec(code.trim());
  if (!m) return null;
  const rows = parseInt(m[1], 10);
  const cols = parseInt(m[2], 10);
  const numColors = parseInt(m[3], 10);
  const cells = m[4].toLowerCase();
  const seed: Cell = { r: parseInt(m[5], 10), c: parseInt(m[6], 10) };
  if (cells.length !== rows * cols) return null;
  if (seed.r < 0 || seed.r >= rows || seed.c < 0 || seed.c >= cols) return null;
  const grid: Grid = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const ch = cells[r * cols + c];
      row.push(ch === "." ? -1 : CODE_CHARS.indexOf(ch));
    }
    grid.push(row);
  }
  return { grid, numColors, seed };
}
