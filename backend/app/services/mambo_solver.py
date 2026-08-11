"""Mambo (a.k.a. Takuzu / Binairo) solver, deduction engine and generator.

Rules — mirrors web/src/app/games/mambo/logic.ts:

  * Every cell holds one of two symbols: 0 = circle, 1 = square.
  * No three identical symbols consecutively in any row or column.
  * Each row and column holds equally many of the two symbols, so both side
    lengths must be even.
  * An "=" sign between two neighbouring cells forces them to match; an "x"
    sign forces them to differ.

There is deliberately no "every row distinct" rule — that belongs to other
Binairo variants, not to Mambo as described by the puzzle's own rules.

Everything here is built on one constraint propagator over those rules.
``solve`` wraps it in a backtracking search that counts solutions (capped at
2, which is all a uniqueness check needs). ``solve_steps`` re-derives the same
fill one cell at a time and labels each deduction with the technique a human
would have used, so the UI can narrate a solve. ``generate`` builds a random
full board, sprinkles signs, then removes as much as it can while the puzzle
stays solvable by the technique tier the requested difficulty allows.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass

EMPTY = -1
CIRCLE = 0
SQUARE = 1

SIGN_NONE = 0
SIGN_EQUAL = 1
SIGN_OPPOSITE = 2

SYMBOL_NAMES = ("circle", "square")

Grid = list[list[int]]
Signs = list[list[int]]

MIN_SIDE = 4
MAX_SIDE = 16

# Technique names, in the order a human reaches for them. Everything up to
# TECH_COUNT is "basic" (tier 0) — the three strategies in the game's own
# rules; the two forcing techniques are what a solver falls back on.
TECH_SIGN_EQUAL = "sign-equal"
TECH_SIGN_OPPOSITE = "sign-opposite"
TECH_PAIR = "pair"
TECH_SANDWICH = "sandwich"
TECH_COUNT = "count"
TECH_ELIMINATION = "elimination"
TECH_DEEP = "deep"

DIFFICULTIES = ("easy", "medium", "hard")
"""Difficulty is the highest technique tier the puzzle *requires*: tier 0
(basic rules only) is easy, tier 1 (a value that breaks a rule at once) is
medium, tier 2 (a value that only fails several steps later) is hard."""


# --------------------------------------------------------------------------
# puzzle geometry
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Line:
    """One row or column: the cells that must split evenly between symbols."""

    kind: str  # "row" | "col"
    index: int
    cells: tuple[int, ...]

    @property
    def label(self) -> str:
        return f"{'Row' if self.kind == 'row' else 'Column'} {self.index + 1}"


@dataclass(frozen=True)
class Puzzle:
    """Everything about a board that doesn't change as cells get filled.

    The `cell_*` members are reverse indexes: which constraints mention a given
    cell. Propagation uses them to revisit only the constraints a change can
    possibly have affected instead of rescanning the whole board.
    """

    rows: int
    cols: int
    # (cell a, cell b, SIGN_EQUAL | SIGN_OPPOSITE) for every sign present.
    pair_signs: tuple[tuple[int, int, int], ...]
    lines: tuple[Line, ...]
    # Every window of three consecutive cells, across rows and columns.
    triples: tuple[tuple[int, int, int], ...]
    cell_pairs: tuple[tuple[tuple[int, int], ...], ...]
    cell_triples: tuple[tuple[int, ...], ...]
    cell_lines: tuple[tuple[int, ...], ...]

    @property
    def size(self) -> int:
        return self.rows * self.cols

    def label(self, idx: int) -> str:
        return f"r{idx // self.cols + 1}c{idx % self.cols + 1}"


def _validate_dims(rows: int, cols: int) -> None:
    if rows < MIN_SIDE or cols < MIN_SIDE or rows > MAX_SIDE or cols > MAX_SIDE:
        raise ValueError(f"Board sides must be between {MIN_SIDE} and {MAX_SIDE}.")
    if rows % 2 or cols % 2:
        raise ValueError("Board sides must be even so each line can split evenly.")


def _check_sign_shape(signs: Signs, rows: int, cols: int, name: str) -> None:
    if len(signs) != rows or any(len(row) != cols for row in signs):
        raise ValueError(f"{name} must be a {rows}x{cols} grid.")
    for row in signs:
        for s in row:
            if s not in (SIGN_NONE, SIGN_EQUAL, SIGN_OPPOSITE):
                raise ValueError(f"{name} values must be 0 (none), 1 (=) or 2 (x).")


def build_puzzle(rows: int, cols: int, h_signs: Signs, v_signs: Signs) -> Puzzle:
    """Precompute the constraint structures for a `rows` x `cols` board.

    `h_signs` is rows x (cols - 1) — the sign between (r, c) and (r, c + 1);
    `v_signs` is (rows - 1) x cols — the sign between (r, c) and (r + 1, c).
    """
    _validate_dims(rows, cols)
    _check_sign_shape(h_signs, rows, cols - 1, "Horizontal signs")
    _check_sign_shape(v_signs, rows - 1, cols, "Vertical signs")

    pair_signs: list[tuple[int, int, int]] = []
    for r in range(rows):
        for c in range(cols - 1):
            if h_signs[r][c] != SIGN_NONE:
                idx = r * cols + c
                pair_signs.append((idx, idx + 1, h_signs[r][c]))
    for r in range(rows - 1):
        for c in range(cols):
            if v_signs[r][c] != SIGN_NONE:
                idx = r * cols + c
                pair_signs.append((idx, idx + cols, v_signs[r][c]))

    lines: list[Line] = []
    for r in range(rows):
        lines.append(Line("row", r, tuple(r * cols + c for c in range(cols))))
    for c in range(cols):
        lines.append(Line("col", c, tuple(r * cols + c for r in range(rows))))

    triples: list[tuple[int, int, int]] = []
    for r in range(rows):
        for c in range(cols - 2):
            idx = r * cols + c
            triples.append((idx, idx + 1, idx + 2))
    for r in range(rows - 2):
        for c in range(cols):
            idx = r * cols + c
            triples.append((idx, idx + cols, idx + 2 * cols))

    size = rows * cols
    cell_pairs: list[list[tuple[int, int]]] = [[] for _ in range(size)]
    for a, b, sign in pair_signs:
        cell_pairs[a].append((b, sign))
        cell_pairs[b].append((a, sign))
    cell_triples: list[list[int]] = [[] for _ in range(size)]
    for t, (a, b, c) in enumerate(triples):
        cell_triples[a].append(t)
        cell_triples[b].append(t)
        cell_triples[c].append(t)
    cell_lines: list[list[int]] = [[] for _ in range(size)]
    for li, line in enumerate(lines):
        for i in line.cells:
            cell_lines[i].append(li)

    return Puzzle(
        rows=rows,
        cols=cols,
        pair_signs=tuple(pair_signs),
        lines=tuple(lines),
        triples=tuple(triples),
        cell_pairs=tuple(tuple(p) for p in cell_pairs),
        cell_triples=tuple(tuple(t) for t in cell_triples),
        cell_lines=tuple(tuple(li) for li in cell_lines),
    )


def _parse_board(grid: Grid, pz: Puzzle) -> list[int]:
    """Flatten a caller-supplied grid, rejecting anything but -1 / 0 / 1."""
    if len(grid) != pz.rows or any(len(row) != pz.cols for row in grid):
        raise ValueError(f"Grid must be {pz.rows}x{pz.cols}.")
    board: list[int] = []
    for row in grid:
        for v in row:
            if v not in (EMPTY, CIRCLE, SQUARE):
                raise ValueError("Cells must be -1 (empty), 0 (circle) or 1 (square).")
            board.append(v)
    return board


def _unflatten(board: list[int], pz: Puzzle) -> Grid:
    return [list(board[r * pz.cols : (r + 1) * pz.cols]) for r in range(pz.rows)]


def _first_empty(board: list[int]) -> int:
    try:
        return board.index(EMPTY)
    except ValueError:
        return -1


# --------------------------------------------------------------------------
# constraint propagation
# --------------------------------------------------------------------------


def _propagate(board: list[int], pz: Puzzle, dirty: tuple[int, ...] | None = None) -> bool:
    """Fill everything the three rules plus the signs force, in place.

    Returns False as soon as the board is proven contradictory. `dirty` names
    the cells that changed since the board was last at a fixpoint, so only the
    constraints touching them get revisited; pass None (the default) for a
    board that has never been propagated, which checks everything. Passing a
    `dirty` set for a board that *isn't* at a fixpoint is not wrong, just
    weaker — it can miss forced cells, never invent one.

    This is the bulk twin of `_basic_deduction` below: same rules, but it
    applies all of them instead of stopping at the first, because the search
    runs it in its hot loop. Any rule added to one belongs in the other too.

    Terminates because cells only ever go from empty to filled, so each cell
    can be queued at most once per assignment.
    """
    queue = list(range(len(board))) if dirty is None else list(dirty)

    while queue:
        idx = queue.pop()

        for other, sign in pz.cell_pairs[idx]:
            va, vb = board[idx], board[other]
            if va != EMPTY and vb != EMPTY:
                if (va == vb) != (sign == SIGN_EQUAL):
                    return False
            elif va != EMPTY:
                board[other] = va if sign == SIGN_EQUAL else 1 - va
                queue.append(other)
            elif vb != EMPTY:
                board[idx] = vb if sign == SIGN_EQUAL else 1 - vb
                queue.append(idx)

        for t in pz.cell_triples[idx]:
            a, b, c = pz.triples[t]
            va, vb, vc = board[a], board[b], board[c]
            empties = (va == EMPTY) + (vb == EMPTY) + (vc == EMPTY)
            if empties == 0:
                if va == vb == vc:
                    return False
            elif empties == 1:
                if va == EMPTY:
                    if vb == vc:
                        board[a] = 1 - vb
                        queue.append(a)
                elif vb == EMPTY:
                    if va == vc:
                        board[b] = 1 - va
                        queue.append(b)
                elif va == vb:
                    board[c] = 1 - va
                    queue.append(c)

        for li in pz.cell_lines[idx]:
            cells = pz.lines[li].cells
            half = len(cells) // 2
            n0 = n1 = 0
            for i in cells:
                v = board[i]
                if v == CIRCLE:
                    n0 += 1
                elif v == SQUARE:
                    n1 += 1
            if n0 > half or n1 > half:
                return False
            if n0 + n1 == len(cells):
                continue
            fill = SQUARE if n0 == half else CIRCLE if n1 == half else EMPTY
            if fill != EMPTY:
                for i in cells:
                    if board[i] == EMPTY:
                        board[i] = fill
                        queue.append(i)

    return True


def _has_conflict(board: list[int], pz: Puzzle) -> bool:
    """True if the cells already filled break a rule between themselves.

    Distinct from `_propagate` returning False, which also covers boards that
    are merely dead ends — nothing visibly wrong yet, but unfillable.
    """
    for a, b, sign in pz.pair_signs:
        va, vb = board[a], board[b]
        if va != EMPTY and vb != EMPTY and (va == vb) != (sign == SIGN_EQUAL):
            return True
    for a, b, c in pz.triples:
        if board[a] != EMPTY and board[a] == board[b] == board[c]:
            return True
    for line in pz.lines:
        half = len(line.cells) // 2
        n0 = sum(1 for i in line.cells if board[i] == CIRCLE)
        n1 = sum(1 for i in line.cells if board[i] == SQUARE)
        if n0 > half or n1 > half:
            return True
    return False


# --------------------------------------------------------------------------
# search
# --------------------------------------------------------------------------


class _Search:
    """Backtracking solution counter with a wall-clock budget.

    `timed_out` means the counts it returned are lower bounds, not answers, so
    every caller checks it before trusting a 0 or a 1.
    """

    def __init__(self, pz: Puzzle, deadline: float | None) -> None:
        self.pz = pz
        self.deadline = deadline
        self.nodes = 0
        self.timed_out = False
        self.first: list[int] | None = None

    def expired(self) -> bool:
        if self.deadline is None:
            return False
        if time.monotonic() > self.deadline:
            self.timed_out = True
            return True
        return False

    def completions(
        self,
        board: list[int],
        limit: int,
        dirty: tuple[int, ...] | None = None,
    ) -> int:
        """How many ways `board` can be finished, counted up to `limit`.

        `dirty` is passed straight to `_propagate`, so callers holding a board
        already at a fixpoint can name just the cell they changed.
        """
        self.first = None
        return self._count(list(board), limit, dirty)

    def _count(self, board: list[int], limit: int, dirty: tuple[int, ...] | None) -> int:
        if limit <= 0 or self.expired():
            return 0
        self.nodes += 1
        if not _propagate(board, self.pz, dirty):
            return 0
        idx = _first_empty(board)
        if idx < 0:
            if self.first is None:
                self.first = board
            return 1
        total = 0
        for val in (CIRCLE, SQUARE):
            child = list(board)
            child[idx] = val
            # The parent is at a fixpoint, so the assignment is all that's new.
            total += self._count(child, limit - total, (idx,))
            if total >= limit or self.timed_out:
                break
        return total


# --------------------------------------------------------------------------
# deductions
# --------------------------------------------------------------------------


@dataclass
class Deduction:
    r: int
    c: int
    value: int
    technique: str
    detail: str


def _basic_deduction(board: list[int], pz: Puzzle) -> Deduction | None:
    """The first cell forced by the game's own three strategies, with the
    human-readable reason why. Scanned in the order a player would look."""

    def make(idx: int, value: int, technique: str, detail: str) -> Deduction:
        return Deduction(idx // pz.cols, idx % pz.cols, value, technique, detail)

    for a, b, sign in pz.pair_signs:
        va, vb = board[a], board[b]
        if (va == EMPTY) == (vb == EMPTY):
            continue
        known, unknown = (a, b) if vb == EMPTY else (b, a)
        v = board[known]
        if sign == SIGN_EQUAL:
            return make(
                unknown,
                v,
                TECH_SIGN_EQUAL,
                f"{pz.label(known)} is a {SYMBOL_NAMES[v]} and the = sign joins it to "
                f"{pz.label(unknown)}, so they must match.",
            )
        return make(
            unknown,
            1 - v,
            TECH_SIGN_OPPOSITE,
            f"{pz.label(known)} is a {SYMBOL_NAMES[v]} and the ✕ sign forces "
            f"{pz.label(unknown)} to be the opposite.",
        )

    for a, b, c in pz.triples:
        va, vb, vc = board[a], board[b], board[c]
        if (va == EMPTY) + (vb == EMPTY) + (vc == EMPTY) != 1:
            continue
        if vb == EMPTY:
            if va != vc:
                continue
            return make(
                b,
                1 - va,
                TECH_SANDWICH,
                f"{pz.label(a)} and {pz.label(c)} are both {SYMBOL_NAMES[va]}s, so a "
                f"{SYMBOL_NAMES[va]} between them would make three in a row.",
            )
        target, k1, k2 = (a, b, c) if va == EMPTY else (c, a, b)
        if board[k1] != board[k2]:
            continue
        v = board[k1]
        return make(
            target,
            1 - v,
            TECH_PAIR,
            f"{pz.label(k1)} and {pz.label(k2)} are already two {SYMBOL_NAMES[v]}s in a "
            f"row, so {pz.label(target)} can't be a third one.",
        )

    for line in pz.lines:
        half = len(line.cells) // 2
        counts = [0, 0]
        first_empty = -1
        for i in line.cells:
            v = board[i]
            if v == EMPTY:
                if first_empty < 0:
                    first_empty = i
            else:
                counts[v] += 1
        if first_empty < 0:
            continue
        for v in (CIRCLE, SQUARE):
            if counts[v] == half:
                return make(
                    first_empty,
                    1 - v,
                    TECH_COUNT,
                    f"{line.label} already holds all {half} of its {SYMBOL_NAMES[v]}s, so "
                    f"every cell left in it is a {SYMBOL_NAMES[1 - v]}.",
                )

    return None


def _forcing_deduction(
    board: list[int],
    pz: Puzzle,
    *,
    search: _Search,
    deep: bool,
) -> tuple[Deduction | None, bool]:
    """A cell where one of the two symbols can be ruled out by trying it.

    With `deep` false the trial only has to break a rule under propagation —
    cheap, and the kind of one-step-ahead check a player does in their head.
    With `deep` true it runs the full search, which catches values that only
    fail much later.

    The second element of the result is True when some cell has *no* legal
    symbol left, which proves the board can't be completed at all. That makes
    the caller's solvability check unnecessary: ruling out one symbol always
    prompts a check of the other, so a dead end reports itself.

    Assumes `board` is at a fixpoint of the basic rules — which is exactly when
    callers reach for this — so each trial need only propagate from the cell it
    assigns.
    """
    for idx, cur in enumerate(board):
        if cur != EMPTY:
            continue
        if search.expired():
            return None, False
        ruled_out: list[int] = []
        for val in (CIRCLE, SQUARE):
            trial = list(board)
            trial[idx] = val
            if deep:
                dead = search.completions(trial, 1, (idx,)) == 0 and not search.timed_out
            else:
                dead = not _propagate(trial, pz, (idx,))
            if dead:
                ruled_out.append(val)
        if not ruled_out:
            continue
        if len(ruled_out) == 2:
            return None, True
        val = ruled_out[0]
        other = 1 - val
        lead = (
            f"A {SYMBOL_NAMES[val]} at {pz.label(idx)} leads to a dead end a few moves later"
            if deep
            else f"A {SYMBOL_NAMES[val]} at {pz.label(idx)} breaks a rule straight away"
        )
        return (
            Deduction(
                idx // pz.cols,
                idx % pz.cols,
                other,
                TECH_DEEP if deep else TECH_ELIMINATION,
                f"{lead}, so it has to be a {SYMBOL_NAMES[other]}.",
            ),
            False,
        )
    return None, False


def _next_deduction(
    board: list[int],
    pz: Puzzle,
    *,
    search: _Search,
) -> tuple[Deduction | None, bool]:
    """The next forced cell, or a flag saying the board can't be completed."""
    d = _basic_deduction(board, pz)
    if d is not None:
        return d, False
    for deep in (False, True):
        d, dead_end = _forcing_deduction(board, pz, search=search, deep=deep)
        if d is not None or dead_end:
            return d, dead_end
    return None, False


def _run_engine(
    board: list[int],
    pz: Puzzle,
    *,
    search: _Search,
    steps: list[Deduction] | None = None,
) -> tuple[bool, bool]:
    """Fill `board` in place with forced cells until nothing more is forced.

    Returns (completed, dead_end), and appends every deduction to `steps` when
    one is given. Because each technique only ever fills a cell that *must*
    hold that symbol, completing the board is also a proof that the solution is
    unique — see `_has_single_solution`.
    """
    while _first_empty(board) >= 0:
        if search.expired():
            return False, False
        d, dead_end = _next_deduction(board, pz, search=search)
        if d is None:
            return False, dead_end
        board[d.r * pz.cols + d.c] = d.value
        if steps is not None:
            steps.append(d)

    # Every deduction is only implied by "assume this board has a solution", so
    # on a board that has none they can cheerfully fill in nonsense. A filled
    # board therefore has to be checked against the rules before it counts as a
    # solution; failing that check proves no solution existed to begin with.
    if _has_conflict(board, pz):
        return False, True
    return True, False


def _has_single_solution(board: list[int], pz: Puzzle, *, search: _Search) -> bool:
    """Whether `board` has exactly one completion.

    Equivalent to counting completions and getting 1, but usually far quicker:
    every deduction is forced, so finishing the board proves uniqueness, and
    conversely a board with one solution always yields to the deep tier (the
    wrong symbol in any cell has no completion, so trying it fails). Counting
    instead has to exhaust the whole tree to prove nothing else fits.

    False also covers "no solution" and "ran out of time", so callers that need
    to tell those apart must ask further questions.
    """
    completed, _ = _run_engine(list(board), pz, search=search)
    return completed


def _logic_level(
    board: list[int],
    pz: Puzzle,
    *,
    search: _Search,
    max_level: int,
) -> int | None:
    """Highest technique tier needed to fill `board` completely, in place.

    `max_level` is 0 (the basic rules alone) or 1 (also one-step trials). The
    deep tier is deliberately not on offer: for a board known to have a single
    solution deep trials always succeed, so allowing them here would answer
    nothing that `_Search` doesn't answer faster.

    None means the allowed techniques stall or the clock ran out; for a board
    known to be solvable, stalling means it has more than one solution. Uses
    bulk propagation rather than `_next_deduction`'s narrated single steps,
    because the generator calls this once per candidate clue removal.
    """
    level = 0
    if not _propagate(board, pz):
        return None
    while _first_empty(board) >= 0:
        if search.expired() or max_level < 1:
            return None
        d, _ = _forcing_deduction(board, pz, search=search, deep=False)
        if d is None:
            return None
        level = 1
        idx = d.r * pz.cols + d.c
        board[idx] = d.value
        if not _propagate(board, pz, (idx,)):
            return None
    return level


# --------------------------------------------------------------------------
# public API
# --------------------------------------------------------------------------


def _deadline(time_budget_ms: int) -> float:
    return time.monotonic() + max(1, time_budget_ms) / 1000.0


@dataclass
class SolveResult:
    solution: Grid | None
    # Capped at 2, so 2 means "two or more".
    solution_count: int
    unique: bool
    timed_out: bool
    node_count: int


def solve(
    grid: Grid,
    h_signs: Signs,
    v_signs: Signs,
    *,
    time_budget_ms: int = 3000,
) -> SolveResult:
    """Complete `grid`, and say whether the completion is the only one."""
    pz = build_puzzle(len(grid), len(grid[0]) if grid else 0, h_signs, v_signs)
    board = _parse_board(grid, pz)
    deadline = _deadline(time_budget_ms)

    # Fast path: forced-cell reasoning both finds the answer and proves it's
    # the only one, and it beats counting solutions by a wide margin. A puzzle
    # with more than one answer stalls the engine quickly, so it falls through
    # to the search with most of the budget intact.
    probe = list(board)
    probe_search = _Search(pz, min(deadline, time.monotonic() + time_budget_ms / 2000.0))
    completed, dead_end = _run_engine(probe, pz, search=probe_search)
    if completed:
        return SolveResult(
            solution=_unflatten(probe, pz),
            solution_count=1,
            unique=True,
            timed_out=False,
            node_count=probe_search.nodes,
        )
    if dead_end:
        return SolveResult(
            solution=None,
            solution_count=0,
            unique=False,
            timed_out=False,
            node_count=probe_search.nodes,
        )

    search = _Search(pz, deadline)
    search.nodes = probe_search.nodes
    count = search.completions(board, 2)
    return SolveResult(
        solution=_unflatten(search.first, pz) if search.first is not None else None,
        solution_count=count,
        unique=count == 1 and not search.timed_out,
        timed_out=search.timed_out,
        node_count=search.nodes,
    )


@dataclass
class StepsResult:
    steps: list[Deduction]
    solved: bool
    unique: bool
    solution_count: int
    # True when the entries already on the board break a rule against each
    # other, as opposed to merely leading nowhere.
    conflict: bool
    timed_out: bool


def solve_steps(
    grid: Grid,
    h_signs: Signs,
    v_signs: Signs,
    *,
    time_budget_ms: int = 5000,
) -> StepsResult:
    """Narrate a solve from `grid`: one forced cell per step, with reasons.

    The walkthrough runs before any solution counting, because on a sparse
    board the count is by far the more expensive of the two and usually turns
    out to be unnecessary: finishing the board by forced cells alone proves the
    answer is unique, and a dead end reports itself as one.
    """
    pz = build_puzzle(len(grid), len(grid[0]) if grid else 0, h_signs, v_signs)
    board = _parse_board(grid, pz)
    if _has_conflict(board, pz):
        return StepsResult([], False, False, 0, True, False)

    search = _Search(pz, _deadline(time_budget_ms))
    steps: list[Deduction] = []
    solved, dead_end = _run_engine(board, pz, search=search, steps=steps)

    if dead_end:
        # Nothing fits in some cell, so the entries already on the board can't
        # be completed however the rest is filled.
        return StepsResult(steps, False, False, 0, False, search.timed_out)

    if solved:
        return StepsResult(steps, True, True, 1, False, search.timed_out)

    # Stalled with cells to spare: only now is a count worth paying for, to
    # tell "ambiguous" apart from "ran out of time".
    count = search.completions(board, 2)
    return StepsResult(
        steps=steps,
        solved=False,
        unique=count == 1 and not search.timed_out,
        solution_count=count,
        conflict=False,
        timed_out=search.timed_out,
    )


def _random_solution(pz: Puzzle, rng: random.Random, deadline: float) -> list[int] | None:
    """A random board satisfying every rule (signs are added afterwards)."""

    def fill(board: list[int], dirty: tuple[int, ...] | None) -> bool:
        if time.monotonic() > deadline:
            return False
        if not _propagate(board, pz, dirty):
            return False
        idx = _first_empty(board)
        if idx < 0:
            return True
        order = [CIRCLE, SQUARE]
        rng.shuffle(order)
        for val in order:
            child = list(board)
            child[idx] = val
            if fill(child, (idx,)):
                board[:] = child
                return True
        return False

    board = [EMPTY] * pz.size
    return board if fill(board, None) else None


@dataclass
class GenerateResult:
    grid: Grid
    solution: Grid
    h_signs: Signs
    v_signs: Signs
    # The difficulty actually achieved, which `exact_match` compares to the
    # one that was asked for.
    difficulty: str
    # False when the clock ran out before the tier could be established, in
    # which case `difficulty` is the worst case rather than a measurement.
    difficulty_confirmed: bool
    exact_match: bool
    attempts: int
    given_count: int


def generate(
    rows: int,
    cols: int,
    difficulty: str = "medium",
    *,
    sign_density: float = 0.15,
    max_attempts: int = 12,
    time_budget_ms: int = 8000,
    seed: int | None = None,
) -> GenerateResult:
    """Build a puzzle with exactly one solution at (or near) `difficulty`.

    Strategy: take a random full board, label a scattering of neighbouring
    pairs with the sign they happen to satisfy, then walk the clues and signs
    removing everything that can go while the puzzle still solves under the
    techniques `difficulty` permits. Whatever survives is minimal in that
    sense, so almost nothing on the board is redundant.

    A handful of signs are held back from removal entirely: left to the pruner
    the signs almost all turn out to be redundant, and a Mambo board with no =
    or x on it is just a plain Takuzu grid.
    """
    _validate_dims(rows, cols)
    if difficulty not in DIFFICULTIES:
        raise ValueError(f"Difficulty must be one of {', '.join(DIFFICULTIES)}.")
    wanted = DIFFICULTIES.index(difficulty)
    deadline = _deadline(time_budget_ms)
    # Hold a slice of the budget back for the difficulty measurement. It only
    # takes milliseconds, but starting it with no time left would leave the
    # puzzle unlabelled, so pruning stops early enough to leave room.
    prune_deadline = deadline - min(1.0, time_budget_ms / 1000.0 * 0.15)
    rng = random.Random(seed)

    all_pairs = [("h", r, c) for r in range(rows) for c in range(cols - 1)]
    all_pairs += [("v", r, c) for r in range(rows - 1) for c in range(cols)]
    sign_target = round(len(all_pairs) * sign_density)
    min_signs = min(sign_target, max(2, round(len(all_pairs) * 0.03)))

    best: GenerateResult | None = None
    attempts = 0

    while attempts < max_attempts:
        attempts += 1
        empty_pz = build_puzzle(
            rows,
            cols,
            [[SIGN_NONE] * (cols - 1) for _ in range(rows)],
            [[SIGN_NONE] * cols for _ in range(rows - 1)],
        )
        solution = _random_solution(empty_pz, rng, deadline)
        if solution is None:
            break

        h_signs = [[SIGN_NONE] * (cols - 1) for _ in range(rows)]
        v_signs = [[SIGN_NONE] * cols for _ in range(rows - 1)]
        chosen = rng.sample(all_pairs, min(sign_target, len(all_pairs)))
        for kind, r, c in chosen:
            idx = r * cols + c
            other = idx + 1 if kind == "h" else idx + cols
            same = solution[idx] == solution[other]
            sign = SIGN_EQUAL if same else SIGN_OPPOSITE
            if kind == "h":
                h_signs[r][c] = sign
            else:
                v_signs[r][c] = sign

        grid = _unflatten(solution, empty_pz)

        def solvable_within(level: int) -> bool:
            """Does the puzzle as it stands solve using tier <= `level`?

            A complete fill by sound techniques is also a uniqueness proof, so
            none of these need a separate solution count.
            """
            pz = build_puzzle(rows, cols, h_signs, v_signs)
            search = _Search(pz, prune_deadline)
            board = _parse_board(grid, pz)
            if level >= 2:
                return _has_single_solution(board, pz, search=search)
            return _logic_level(board, pz, search=search, max_level=level) is not None

        # Clues and signs are offered up interleaved so the puzzle ends up
        # leaning on both, rather than stripping one kind down to nothing.
        items: list[tuple[str, int, int]] = [
            ("cell", r, c) for r in range(rows) for c in range(cols)
        ]
        items += chosen
        rng.shuffle(items)
        signs_left = len(chosen)

        for kind, r, c in items:
            if time.monotonic() > prune_deadline:
                break
            if kind == "cell":
                saved = grid[r][c]
                grid[r][c] = EMPTY
            else:
                if signs_left <= min_signs:
                    continue
                signs = h_signs if kind == "h" else v_signs
                saved = signs[r][c]
                signs[r][c] = SIGN_NONE
                signs_left -= 1
            if not solvable_within(wanted):
                if kind == "cell":
                    grid[r][c] = saved
                else:
                    (h_signs if kind == "h" else v_signs)[r][c] = saved
                    signs_left += 1

        # Rate the finished puzzle by the cheapest tier that cracks it. Only
        # the two cheap tiers get tried: the puzzle is known to have a single
        # solution, so "tier 1 can't finish it" already means deep reasoning is
        # required, and running those deep trials would only confirm it slowly.
        final_pz = build_puzzle(rows, cols, h_signs, v_signs)
        level: int | None = DIFFICULTIES.index("hard")
        for tier in (0, 1):
            probe = _Search(final_pz, deadline)
            if (
                _logic_level(_parse_board(grid, final_pz), final_pz, search=probe, max_level=tier)
                is not None
            ):
                level = tier
                break
            if probe.timed_out:
                # Out of time: the tier is unknown, not necessarily the hardest.
                level = None
                break
        achieved = DIFFICULTIES[level] if level is not None else DIFFICULTIES[-1]
        candidate = GenerateResult(
            grid=[row[:] for row in grid],
            solution=_unflatten(solution, empty_pz),
            h_signs=[row[:] for row in h_signs],
            v_signs=[row[:] for row in v_signs],
            difficulty=achieved,
            difficulty_confirmed=level is not None,
            exact_match=level is not None and achieved == difficulty,
            attempts=attempts,
            given_count=sum(1 for row in grid for v in row if v != EMPTY),
        )
        if candidate.exact_match:
            return candidate
        if best is None or abs(DIFFICULTIES.index(achieved) - wanted) < abs(
            DIFFICULTIES.index(best.difficulty) - wanted
        ):
            best = candidate
        if time.monotonic() > deadline:
            break

    if best is None:
        raise ValueError("Couldn't generate a puzzle in the time available — try again.")
    best.attempts = attempts
    return best
