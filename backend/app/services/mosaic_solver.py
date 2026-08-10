"""Mosaic / Flood-It solver — mirrors web/src/app/games/mosaic/solver.ts.

Rules: there is a fixed start tile ("seed"). A move picks a color c. The
connected blob of tiles reachable from the seed (all same current color) is
repainted to c, which makes it contiguous with any neighboring tiles that
already happen to be color c, so the blob grows. Goal: repaint the whole
board to one color in as few moves as possible.

Solving runs on a reduced "region graph" (connected same-color blobs become
single nodes), which is much smaller than the pixel grid. Adjacent region
nodes always differ in color (otherwise they'd already be merged), so a
single move can only ever absorb nodes exactly one hop away from the
current blob — it can never leapfrog two hops in one move. That makes the
region graph's hop-eccentricity from the seed an admissible lower bound on
moves remaining, which drives an IDA* search for a provably optimal
solution, with a greedy 2-ply lookahead as a time-budget fallback.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

Grid = list[list[int]]

_DIRS = ((-1, 0), (1, 0), (0, -1), (0, 1))


@dataclass
class Cell:
    r: int
    c: int


@dataclass
class RegionNode:
    id: int
    color: int
    neighbors: set[int] = field(default_factory=set)


Nodes = list[RegionNode | None]


def _flood_fill_cells(grid: Grid, r0: int, c0: int) -> list[tuple[int, int]]:
    rows, cols = len(grid), len(grid[0])
    target = grid[r0][c0]
    seen = [[False] * cols for _ in range(rows)]
    seen[r0][c0] = True
    stack = [(r0, c0)]
    cells: list[tuple[int, int]] = []
    while stack:
        r, c = stack.pop()
        cells.append((r, c))
        for dr, dc in _DIRS:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if seen[nr][nc] or grid[nr][nc] != target:
                continue
            seen[nr][nc] = True
            stack.append((nr, nc))
    return cells


@dataclass
class RegionGraph:
    nodes: Nodes
    comp_id: list[int]
    rows: int
    cols: int


def build_region_graph(grid: Grid) -> RegionGraph:
    rows, cols = len(grid), len(grid[0])
    comp_id = [-1] * (rows * cols)
    nodes: list[RegionNode] = []
    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            if comp_id[idx] != -1:
                continue
            node_id = len(nodes)
            color = grid[r][c]
            for cr, cc in _flood_fill_cells(grid, r, c):
                comp_id[cr * cols + cc] = node_id
            nodes.append(RegionNode(id=node_id, color=color))
    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            node_id = comp_id[idx]
            if c + 1 < cols:
                other = comp_id[idx + 1]
                if other != node_id:
                    nodes[node_id].neighbors.add(other)
                    nodes[other].neighbors.add(node_id)
            if r + 1 < rows:
                other = comp_id[idx + cols]
                if other != node_id:
                    nodes[node_id].neighbors.add(other)
                    nodes[other].neighbors.add(node_id)
    return RegionGraph(nodes=list(nodes), comp_id=comp_id, rows=rows, cols=cols)


def _clone_nodes(nodes: Nodes) -> Nodes:
    return [RegionNode(n.id, n.color, set(n.neighbors)) if n else None for n in nodes]


def apply_move_region(nodes: Nodes, seed_id: int, color: int) -> tuple[Nodes, bool]:
    seed_node = nodes[seed_id]
    assert seed_node is not None
    if seed_node.color == color:
        return nodes, False
    g = _clone_nodes(nodes)
    seed = g[seed_id]
    assert seed is not None
    seed.color = color
    to_merge = [nid for nid in seed.neighbors if g[nid] is not None and g[nid].color == color]
    for nid in to_merge:
        n = g[nid]
        assert n is not None
        for nb in n.neighbors:
            if nb == seed_id:
                continue
            nb_node = g[nb]
            if nb_node is not None:
                nb_node.neighbors.discard(nid)
                nb_node.neighbors.add(seed_id)
            seed.neighbors.add(nb)
        seed.neighbors.discard(nid)
        g[nid] = None
    return g, True


def active_count(nodes: Nodes) -> int:
    return sum(1 for n in nodes if n is not None)


def eccentricity(nodes: Nodes, seed_id: int) -> int:
    """BFS hop-eccentricity of the seed node — admissible lower bound on moves left."""
    max_d = 0
    dist = {seed_id: 0}
    frontier = [seed_id]
    while frontier:
        nxt: list[int] = []
        for nid in frontier:
            node = nodes[nid]
            assert node is not None
            for nb in node.neighbors:
                if nb in dist:
                    continue
                d = dist[nid] + 1
                dist[nb] = d
                max_d = max(max_d, d)
                nxt.append(nb)
        frontier = nxt
    return max_d


def candidate_colors(nodes: Nodes, seed_id: int) -> list[int]:
    seed = nodes[seed_id]
    assert seed is not None
    colors: set[int] = set()
    for nb in seed.neighbors:
        nb_node = nodes[nb]
        assert nb_node is not None
        colors.add(nb_node.color)
    return list(colors)


def greedy_solve(nodes: Nodes, seed_id: int, max_moves: int = 1000) -> list[int]:
    """Fast, decent (not necessarily optimal) solution via 2-ply greedy lookahead."""
    cur = nodes
    moves: list[int] = []
    while active_count(cur) > 1 and len(moves) < max_moves:
        best: int | None = None
        best_score = float("inf")
        best_nodes: Nodes | None = None
        for c in candidate_colors(cur, seed_id):
            n1, _ = apply_move_region(cur, seed_id, c)
            best_inner = float(active_count(n1))
            for c2 in candidate_colors(n1, seed_id):
                n2, _ = apply_move_region(n1, seed_id, c2)
                best_inner = min(best_inner, active_count(n2))
            if best_inner < best_score:
                best_score = best_inner
                best = c
                best_nodes = n1
        assert best is not None and best_nodes is not None
        moves.append(best)
        cur = best_nodes
    return moves


@dataclass
class SolveResult:
    moves: list[int]
    optimal: bool
    # False only when a time budget cut the search short before it could
    # either find a solution or exhaust the search ceiling — i.e. the result
    # is inconclusive rather than a proven answer.
    proven: bool = True


def solve_from_nodes(
    nodes: Nodes,
    seed_id: int,
    time_budget_ms: int = 3000,
    greedy_moves: list[int] | None = None,
    max_moves: int | None = None,
) -> SolveResult:
    """IDA* for a provably-optimal solution from a fixed seed node, bounded by a
    time budget.

    Without `max_moves`, this always finds the true optimum (falling back to
    the greedy solution, marked non-optimal, only if the time budget runs
    out first).

    With `max_moves`, the search ceiling is the cap itself rather than a
    greedy upper bound: IDA* still explores bounds in increasing order from
    the admissible eccentricity heuristic, but gives up as soon as the
    required bound would exceed the cap, instead of continuing on to find
    the (possibly much larger) true optimum. Any solution found this way is
    still provably optimal — the cap only ever causes an early, proven
    "no solution within `max_moves`" (`moves=[]`, `optimal=False`), which is
    cheaper than a full search when the caller only cares about the cap.
    """
    if active_count(nodes) == 1:
        return SolveResult(moves=[], optimal=True)

    if max_moves is None:
        if greedy_moves is None:
            greedy_moves = greedy_solve(nodes, seed_id)
        best = SolveResult(moves=greedy_moves, optimal=False)
        ceiling = len(best.moves)
    else:
        best = SolveResult(moves=[], optimal=False, proven=False)
        ceiling = max_moves

    start = time.monotonic()
    timed_out = False
    path: list[int] = []

    def search(ns: Nodes, sid: int, g: int, bound: int) -> float:
        nonlocal timed_out
        if (time.monotonic() - start) * 1000 > time_budget_ms:
            timed_out = True
            return float("inf")
        h = eccentricity(ns, sid)
        f = g + h
        if f > bound:
            return float(f)
        if active_count(ns) == 1:
            return -1
        scored = []
        for c in candidate_colors(ns, sid):
            n1, _ = apply_move_region(ns, sid, c)
            scored.append((eccentricity(n1, sid), c, n1))
        scored.sort(key=lambda t: t[0])
        min_t = float("inf")
        for _, c, n1 in scored:
            path.append(c)
            t = search(n1, sid, g + 1, bound)
            if t == -1:
                return -1
            if timed_out:
                return float("inf")
            min_t = min(min_t, t)
            path.pop()
        return min_t

    bound = eccentricity(nodes, seed_id)
    while bound <= ceiling:
        path.clear()
        t = search(nodes, seed_id, 0, bound)
        if t == -1:
            return SolveResult(moves=list(path), optimal=True, proven=True)
        if timed_out:
            return SolveResult(moves=best.moves, optimal=best.optimal, proven=False)
        bound = int(t)

    # Ceiling exhausted without success: with no cap this can't happen (the
    # greedy solution is itself a valid bound), so this only fires for a
    # capped search — a proven "no solution within max_moves".
    return SolveResult(moves=best.moves, optimal=best.optimal, proven=True)


@dataclass
class FullSolveResult:
    moves: list[int]
    optimal: bool
    node_count: int
    proven: bool = True


def solve(
    grid: Grid,
    seed: Cell,
    time_budget_ms: int = 3000,
    max_moves: int | None = None,
) -> FullSolveResult:
    graph = build_region_graph(grid)
    seed_id = graph.comp_id[seed.r * graph.cols + seed.c]
    result = solve_from_nodes(
        graph.nodes, seed_id, time_budget_ms=time_budget_ms, max_moves=max_moves
    )
    return FullSolveResult(
        moves=result.moves,
        optimal=result.optimal,
        node_count=len(graph.nodes),
        proven=result.proven,
    )


# ---- free-cell variant ----------------------------------------------------
#
# The solver above assumes the classic Flood-It rule: every move repaints the
# one blob containing a fixed start tile. Many "mosaic" puzzles instead let
# you tap *any* tile and repaint that tile's blob, which is a strictly more
# powerful move and yields much shorter solutions.
#
# Search: plain iterative-deepening DFS over (region, colour) pairs. Two
# things keep it fast enough to be exhaustive:
#
#   1. Admissible heuristic - a move repaints one region R to colour c. Only
#      R's own previous colour can disappear from the board (the absorbed
#      neighbours were colour c, which R now carries), so the number of
#      distinct colours still present drops by at most one per move. Hence
#      `distinct_colours - 1` is a valid lower bound on the moves remaining.
#   2. The final move must merge every remaining region at once, so at depth
#      1 only moves that leave exactly one region are worth trying.
#
# No dominance assumptions: every recolour of every live region across the
# whole palette is generated, including non-merging "setup" moves, so a
# reported optimum is a true optimum.


@dataclass
class FreeMove:
    """Repaint the blob containing cell (r, c) to `color`."""

    r: int
    c: int
    color: int


@dataclass
class FreeSolveResult:
    moves: list[FreeMove]
    optimal: bool
    node_count: int
    proven: bool = True


def _alive_colors(colors: list[int | None]) -> set[int]:
    return {c for c in colors if c is not None}


def solve_free_cell(
    grid: Grid,
    num_colors: int | None = None,
    time_budget_ms: int = 5000,
    max_moves: int | None = None,
) -> FreeSolveResult:
    """Optimal solver for the "tap any tile" rule.

    Returns the shortest sequence of taps that makes the whole board one
    colour. `max_moves` caps the search: if no solution of that length or
    shorter exists the result is an empty move list with `optimal=False`
    (and `proven=True`, since the cap was fully explored).
    """
    graph = build_region_graph(grid)
    n = len(graph.nodes)
    total_regions = n

    rep: dict[int, Cell] = {}
    for r in range(graph.rows):
        for c in range(graph.cols):
            rid = graph.comp_id[r * graph.cols + c]
            if rid not in rep:
                rep[rid] = Cell(r, c)

    colors0 = tuple(nd.color if nd else None for nd in graph.nodes)
    adj0 = tuple(frozenset(nd.neighbors) if nd else frozenset() for nd in graph.nodes)

    palette = list(range(num_colors)) if num_colors else sorted(_alive_colors(list(colors0)))

    if sum(1 for x in colors0 if x is not None) == 1:
        return FreeSolveResult(moves=[], optimal=True, node_count=total_regions)

    def step(
        colors: tuple[int | None, ...], adj: tuple[frozenset[int], ...], rid: int, color: int
    ) -> tuple[tuple[int | None, ...], tuple[frozenset[int], ...]]:
        cs = list(colors)
        ad = [set(a) for a in adj]
        cs[rid] = color
        for nb in [x for x in ad[rid] if cs[x] == color]:
            for x in ad[nb]:
                if x == rid:
                    continue
                ad[x].discard(nb)
                ad[x].add(rid)
                ad[rid].add(x)
            ad[rid].discard(nb)
            ad[nb] = set()
            cs[nb] = None
        return tuple(cs), tuple(frozenset(a) for a in ad)

    def candidates(
        colors: tuple[int | None, ...], adj: tuple[frozenset[int], ...]
    ) -> list[tuple[int, int, int]]:
        """(merge_count, region, colour), best-merging first."""
        out: list[tuple[int, int, int]] = []
        for rid in range(n):
            if colors[rid] is None:
                continue
            counts: dict[int, int] = {}
            for nb in adj[rid]:
                nb_color = colors[nb]
                if nb_color is not None:
                    counts[nb_color] = counts.get(nb_color, 0) + 1
            for color in palette:
                if color == colors[rid]:
                    continue
                out.append((counts.get(color, 0), rid, color))
        out.sort(reverse=True)
        return out

    start = time.monotonic()
    timed_out = False

    def dfs(
        colors: tuple[int | None, ...],
        adj: tuple[frozenset[int], ...],
        depth: int,
        path: list[tuple[int, int]],
        seen: dict,
    ) -> list[tuple[int, int]] | None:
        nonlocal timed_out
        if (time.monotonic() - start) * 1000 > time_budget_ms:
            timed_out = True
            return None
        live = sum(1 for x in colors if x is not None)
        if live == 1:
            return list(path)
        if depth == 0:
            return None
        if len(_alive_colors(list(colors))) - 1 > depth:
            return None
        key = (colors, adj)
        if seen.get(key, -1) >= depth:
            return None
        seen[key] = depth
        for merges, rid, color in candidates(colors, adj):
            if depth == 1 and live - merges != 1:
                continue
            cs, ad = step(colors, adj, rid, color)
            path.append((rid, color))
            got = dfs(cs, ad, depth - 1, path, seen)
            if got is not None:
                return got
            path.pop()
            if timed_out:
                return None
        return None

    # Free-cell moves are a superset of fixed-seed moves, so a greedy
    # fixed-seed solution is a valid ceiling when the caller gave no cap.
    if max_moves is not None:
        ceiling = max_moves
    else:
        seed_id = next(i for i, nd in enumerate(graph.nodes) if nd)
        ceiling = max(1, len(greedy_solve(graph.nodes, seed_id)))

    floor = max(1, len(_alive_colors(list(colors0))) - 1)
    for limit in range(floor, ceiling + 1):
        found = dfs(colors0, adj0, limit, [], {})
        if found is not None:
            return FreeSolveResult(
                moves=[FreeMove(rep[rid].r, rep[rid].c, color) for rid, color in found],
                optimal=True,
                node_count=total_regions,
                proven=True,
            )
        if timed_out:
            return FreeSolveResult(
                moves=[], optimal=False, node_count=total_regions, proven=False
            )

    return FreeSolveResult(moves=[], optimal=False, node_count=total_regions, proven=True)


@dataclass
class BestStartResult:
    seed: Cell
    moves: list[int]
    optimal: bool
    regions_tried: int
    total_regions: int


def solve_best_start(grid: Grid, time_budget_ms: int = 5000) -> BestStartResult:
    """Search over every candidate start tile (one representative per region -
    any cell within the same region gives an identical result) to find the
    start tile that minimizes moves.

    Pruning: eccentricity(region) is an admissible lower bound on the moves
    needed from that region, so once we have an achieved solution of length
    `best`, any region whose eccentricity is already >= `best` can never
    beat it and is skipped without solving it. Trying regions in ascending
    eccentricity order means that once we hit one that gets pruned, every
    remaining region (all with >= eccentricity) is pruned too, so we can
    stop entirely."""
    overall_start = time.monotonic()
    graph = build_region_graph(grid)
    nodes = graph.nodes
    n = len(nodes)

    rep_cell: list[Cell | None] = [None] * n
    for r in range(graph.rows):
        for c in range(graph.cols):
            node_id = graph.comp_id[r * graph.cols + c]
            if rep_cell[node_id] is None:
                rep_cell[node_id] = Cell(r, c)

    if n == 1:
        cell = rep_cell[0]
        assert cell is not None
        return BestStartResult(seed=cell, moves=[], optimal=True, regions_tried=1, total_regions=1)

    ranked = sorted(
        ((node.id, eccentricity(nodes, node.id)) for node in nodes if node is not None),
        key=lambda t: t[1],
    )

    best: dict | None = None
    all_tried_optimal = True
    ran_out_of_time = False
    regions_tried = 0

    for node_id, ecc in ranked:
        if best is not None and ecc >= len(best["moves"]):
            break  # proven: nothing left can beat `best`
        remaining = time_budget_ms - (time.monotonic() - overall_start) * 1000
        if remaining <= 0:
            ran_out_of_time = True
            break
        regions_tried += 1
        result = solve_from_nodes(nodes, node_id, time_budget_ms=int(min(remaining, 2500)))
        if not result.optimal:
            all_tried_optimal = False
        if best is None or len(result.moves) < len(best["moves"]):
            best = {"seed_id": node_id, "moves": result.moves, "optimal": result.optimal}

    assert best is not None
    winner_cell = rep_cell[best["seed_id"]]
    assert winner_cell is not None
    return BestStartResult(
        seed=winner_cell,
        moves=best["moves"],
        optimal=(not ran_out_of_time) and all_tried_optimal and best["optimal"],
        regions_tried=regions_tried,
        total_regions=n,
    )


def random_grid(rows: int, cols: int, num_colors: int) -> Grid:
    return [[random.randint(0, num_colors - 1) for _ in range(cols)] for _ in range(rows)]


@dataclass
class GenerateResult:
    grid: Grid
    seed: Cell
    moves: list[int]
    optimal: bool
    attempts: int
    exact_match: bool


def generate_puzzle(
    rows: int,
    cols: int,
    num_colors: int,
    target_moves: int,
    max_attempts: int = 200,
    time_budget_ms: int = 8000,
) -> GenerateResult:
    """Repeatedly deal a random board and run solve_best_start on it, keeping
    whichever attempt lands closest to `target_moves`, until an exact match
    is found or the attempt/time budget runs out. Always tries at least once,
    even if `time_budget_ms` is tiny."""
    overall_start = time.monotonic()
    best: tuple[Grid, BestStartResult] | None = None
    attempts = 0

    for i in range(max_attempts):
        if i > 0 and (time.monotonic() - overall_start) * 1000 >= time_budget_ms:
            break
        attempts += 1
        grid = random_grid(rows, cols, num_colors)
        remaining = time_budget_ms - (time.monotonic() - overall_start) * 1000
        result = solve_best_start(grid, time_budget_ms=int(max(200, min(remaining, 3000))))
        if len(result.moves) == target_moves:
            return GenerateResult(
                grid=grid,
                seed=result.seed,
                moves=result.moves,
                optimal=result.optimal,
                attempts=attempts,
                exact_match=True,
            )
        if best is None or abs(len(result.moves) - target_moves) < abs(
            len(best[1].moves) - target_moves
        ):
            best = (grid, result)

    assert best is not None
    grid, result = best
    return GenerateResult(
        grid=grid,
        seed=result.seed,
        moves=result.moves,
        optimal=result.optimal,
        attempts=attempts,
        exact_match=False,
    )
