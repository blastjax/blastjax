# Node be:service:mambo_solver: services/mambo_solver.py
Kind: module
Language: python, 650 lines of code, location: backend/app/services/mambo_solver.py

Source excerpt: backend/app/services/mambo_solver.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import random
   4  import time
   5  from dataclasses import dataclass
   6  
   7  EMPTY = -1
   8  CIRCLE = 0
   9  SQUARE = 1
  10  
  11  SIGN_NONE = 0
  12  SIGN_EQUAL = 1
  13  SIGN_OPPOSITE = 2
  14  
  15  SYMBOL_NAMES = ("circle", "square")
  16  
  17  Grid = list[list[int]]
  18  Signs = list[list[int]]
  19  
  20  MIN_SIDE = 4
  21  MAX_SIDE = 16
  22  
  23  TECH_SIGN_EQUAL = "sign-equal"
  24  TECH_SIGN_OPPOSITE = "sign-opposite"
  25  TECH_PAIR = "pair"
  26  TECH_SANDWICH = "sandwich"
  27  TECH_COUNT = "count"
  28  TECH_ELIMINATION = "elimination"
  29  TECH_DEEP = "deep"
  30  
  31  DIFFICULTIES = ("easy", "medium", "hard")
  32  
  33  
  34  
  35  
  36  @dataclass(frozen=True)
  37  class Line:
  38      kind: str
  39      index: int
  40      cells: tuple[int, ...]
  41  
  42      @property
  43      def label(self) -> str:
  44          return f"{'Row' if self.kind == 'row' else 'Column'} {self.index + 1}"
  45  
  46  
  47  @dataclass(frozen=True)
  48  class Puzzle:
  49      rows: int
  50      cols: int
  51      pair_signs: tuple[tuple[int, int, int], ...]
  52      lines: tuple[Line, ...]
  53      triples: tuple[tuple[int, int, int], ...]
  54      cell_pairs: tuple[tuple[tuple[int, int], ...], ...]
  55      cell_triples: tuple[tuple[int, ...], ...]
  56      cell_lines: tuple[tuple[int, ...], ...]
  57  
  58      @property
  59      def size(self) -> int:
  60          return self.rows * self.cols
  61  
  62      def label(self, idx: int) -> str:
  63          return f"r{idx // self.cols + 1}c{idx % self.cols + 1}"
  64  
  65  
  66  def _validate_dims(rows: int, cols: int) -> None:
  67      if rows < MIN_SIDE or cols < MIN_SIDE or rows > MAX_SIDE or cols > MAX_SIDE:
  68          raise ValueError(f"Board sides must be between {MIN_SIDE} and {MAX_SIDE}.")
  69      if rows % 2 or cols % 2:
  70          raise ValueError("Board sides must be even so each line can split evenly.")
  71  
  72  
  73  def _check_sign_shape(signs: Signs, rows: int, cols: int, name: str) -> None:
  74      if len(signs) != rows or any(len(row) != cols for row in signs):
  75          raise ValueError(f"{name} must be a {rows}x{cols} grid.")
  76      for row in signs:
  77          for s in row:
  78              if s not in (SIGN_NONE, SIGN_EQUAL, SIGN_OPPOSITE):
  79                  raise ValueError(f"{name} values must be 0 (none), 1 (=) or 2 (x).")
  80  
  81  
  82  def build_puzzle(rows: int, cols: int, h_signs: Signs, v_signs: Signs) -> Puzzle:
  83      _validate_dims(rows, cols)
  84      _check_sign_shape(h_signs, rows, cols - 1, "Horizontal signs")
  85      _check_sign_shape(v_signs, rows - 1, cols, "Vertical signs")
  86  
  87      pair_signs: list[tuple[int, int, int]] = []
  88      for r in range(rows):
  89          for c in range(cols - 1):
  90              if h_signs[r][c] != SIGN_NONE:
  91                  idx = r * cols + c
  92                  pair_signs.append((idx, idx + 1, h_signs[r][c]))
  93      for r in range(rows - 1):
  94          for c in range(cols):
  95              if v_signs[r][c] != SIGN_NONE:
  96                  idx = r * cols + c
  97                  pair_signs.append((idx, idx + cols, v_signs[r][c]))
  98  
  99      lines: list[Line] = []
 100      for r in range(rows):
 101          lines.append(Line("row", r, tuple(r * cols + c for c in range(cols))))
 102      for c in range(cols):
 103          lines.append(Line("col", c, tuple(r * cols + c for r in range(rows))))
 104  
 105      triples: list[tuple[int, int, int]] = []
 106      for r in range(rows):
 107          for c in range(cols - 2):
 108              idx = r * cols + c
 109              triples.append((idx, idx + 1, idx + 2))
 110      for r in range(rows - 2):
 111          for c in range(cols):
 112              idx = r * cols + c
 113              triples.append((idx, idx + cols, idx + 2 * cols))
 114  
 115      size = rows * cols
 116      cell_pairs: list[list[tuple[int, int]]] = [[] for _ in range(size)]
 117      for a, b, sign in pair_signs:
 118          cell_pairs[a].append((b, sign))
 119          cell_pairs[b].append((a, sign))
 120      cell_triples: list[list[int]] = [[] for _ in range(size)]
 121      for t, (a, b, c) in enumerate(triples):
 122          cell_triples[a].append(t)
 123          cell_triples[b].append(t)
 124          cell_triples[c].append(t)
 125      cell_lines: list[list[int]] = [[] for _ in range(size)]
 126      for li, line in enumerate(lines):
 127          for i in line.cells:
 128              cell_lines[i].append(li)
 129  
 130      return Puzzle(
 131          rows=rows,
 132          cols=cols,
 133          pair_signs=tuple(pair_signs),
 134          lines=tuple(lines),
 135          triples=tuple(triples),
 136          cell_pairs=tuple(tuple(p) for p in cell_pairs),
 137          cell_triples=tuple(tuple(t) for t in cell_triples),
 138          cell_lines=tuple(tuple(li) for li in cell_lines),
 139      )
 140  
 141  
 142  def _parse_board(grid: Grid, pz: Puzzle) -> list[int]:
 143      if len(grid) != pz.rows or any(len(row) != pz.cols for row in grid):
 144          raise ValueError(f"Grid must be {pz.rows}x{pz.cols}.")
 145      board: list[int] = []
 146      for row in grid:
 147          for v in row:
 148              if v not in (EMPTY, CIRCLE, SQUARE):
 149                  raise ValueError("Cells must be -1 (empty), 0 (circle) or 1 (square).")
 150              board.append(v)
```

## Outgoing connections
- none

## Incoming connections
- routers/mambo.py (be:router:mambo) -> call
