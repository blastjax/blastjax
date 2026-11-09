# Node be:service:mosaic_solver: services/mosaic_solver.py
Kind: module
Language: python, 459 lines of code, location: backend/app/services/mosaic_solver.py

Source excerpt: backend/app/services/mosaic_solver.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import random
   4  import time
   5  from dataclasses import dataclass, field
   6  
   7  Grid = list[list[int]]
   8  
   9  _DIRS = ((-1, 0), (1, 0), (0, -1), (0, 1))
  10  
  11  
  12  @dataclass
  13  class Cell:
  14      r: int
  15      c: int
  16  
  17  
  18  @dataclass
  19  class RegionNode:
  20      id: int
  21      color: int
  22      neighbors: set[int] = field(default_factory=set)
  23  
  24  
  25  Nodes = list[RegionNode | None]
  26  
  27  
  28  def _flood_fill_cells(grid: Grid, r0: int, c0: int) -> list[tuple[int, int]]:
  29      rows, cols = len(grid), len(grid[0])
  30      target = grid[r0][c0]
  31      seen = [[False] * cols for _ in range(rows)]
  32      seen[r0][c0] = True
  33      stack = [(r0, c0)]
  34      cells: list[tuple[int, int]] = []
  35      while stack:
  36          r, c = stack.pop()
  37          cells.append((r, c))
  38          for dr, dc in _DIRS:
  39              nr, nc = r + dr, c + dc
  40              if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
  41                  continue
  42              if seen[nr][nc] or grid[nr][nc] != target:
  43                  continue
  44              seen[nr][nc] = True
  45              stack.append((nr, nc))
  46      return cells
  47  
  48  
  49  @dataclass
  50  class RegionGraph:
  51      nodes: Nodes
  52      comp_id: list[int]
  53      rows: int
  54      cols: int
  55  
  56  
  57  def build_region_graph(grid: Grid) -> RegionGraph:
  58      rows, cols = len(grid), len(grid[0])
  59      comp_id = [-1] * (rows * cols)
  60      nodes: list[RegionNode] = []
  61      for r in range(rows):
  62          for c in range(cols):
  63              idx = r * cols + c
  64              if comp_id[idx] != -1:
  65                  continue
  66              node_id = len(nodes)
  67              color = grid[r][c]
  68              for cr, cc in _flood_fill_cells(grid, r, c):
  69                  comp_id[cr * cols + cc] = node_id
  70              nodes.append(RegionNode(id=node_id, color=color))
  71      for r in range(rows):
  72          for c in range(cols):
  73              idx = r * cols + c
  74              node_id = comp_id[idx]
  75              if c + 1 < cols:
  76                  other = comp_id[idx + 1]
  77                  if other != node_id:
  78                      nodes[node_id].neighbors.add(other)
  79                      nodes[other].neighbors.add(node_id)
  80              if r + 1 < rows:
  81                  other = comp_id[idx + cols]
  82                  if other != node_id:
  83                      nodes[node_id].neighbors.add(other)
  84                      nodes[other].neighbors.add(node_id)
  85      return RegionGraph(nodes=list(nodes), comp_id=comp_id, rows=rows, cols=cols)
  86  
  87  
  88  def _clone_nodes(nodes: Nodes) -> Nodes:
  89      return [RegionNode(n.id, n.color, set(n.neighbors)) if n else None for n in nodes]
  90  
  91  
  92  def apply_move_region(nodes: Nodes, seed_id: int, color: int) -> tuple[Nodes, bool]:
  93      seed_node = nodes[seed_id]
  94      assert seed_node is not None
  95      if seed_node.color == color:
  96          return nodes, False
  97      g = _clone_nodes(nodes)
  98      seed = g[seed_id]
  99      assert seed is not None
 100      seed.color = color
 101      to_merge = [nid for nid in seed.neighbors if g[nid] is not None and g[nid].color == color]
 102      for nid in to_merge:
 103          n = g[nid]
 104          assert n is not None
 105          for nb in n.neighbors:
 106              if nb == seed_id:
 107                  continue
 108              nb_node = g[nb]
 109              if nb_node is not None:
 110                  nb_node.neighbors.discard(nid)
 111                  nb_node.neighbors.add(seed_id)
 112              seed.neighbors.add(nb)
 113          seed.neighbors.discard(nid)
 114          g[nid] = None
 115      return g, True
 116  
 117  
 118  def active_count(nodes: Nodes) -> int:
 119      return sum(1 for n in nodes if n is not None)
 120  
 121  
 122  def eccentricity(nodes: Nodes, seed_id: int) -> int:
 123      max_d = 0
 124      dist = {seed_id: 0}
 125      frontier = [seed_id]
 126      while frontier:
 127          nxt: list[int] = []
 128          for nid in frontier:
 129              node = nodes[nid]
 130              assert node is not None
 131              for nb in node.neighbors:
 132                  if nb in dist:
 133                      continue
 134                  d = dist[nid] + 1
 135                  dist[nb] = d
 136                  max_d = max(max_d, d)
 137                  nxt.append(nb)
 138          frontier = nxt
 139      return max_d
 140  
 141  
 142  def candidate_colors(nodes: Nodes, seed_id: int) -> list[int]:
 143      seed = nodes[seed_id]
 144      assert seed is not None
 145      colors: set[int] = set()
 146      for nb in seed.neighbors:
 147          nb_node = nodes[nb]
 148          assert nb_node is not None
 149          colors.add(nb_node.color)
 150      return list(colors)
```

## Outgoing connections
- none

## Incoming connections
- routers/mosaic.py (be:router:mosaic) -> call
