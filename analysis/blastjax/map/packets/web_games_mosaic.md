# Node web:games/mosaic: /games/mosaic
Kind: module
Language: typescript, 1003 lines of code, location: web/src/app/games/mosaic

Files in this directory (largest first):
- web/src/app/games/mosaic/MosaicClient.tsx
- web/src/app/games/mosaic/solver.ts
- web/src/app/games/mosaic/page.tsx

Source excerpt: web/src/app/games/mosaic/MosaicClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useMemo, useRef, useState } from "react";
   4  import {
   5    ACTION_BUTTON_CLASSES,
   6    CARD_CLASSES,
   7    INPUT_CLASSES,
   8    PRIMARY_BUTTON_CLASSES,
   9    SECONDARY_BUTTON_CLASSES,
  10  } from "@/lib/ui";
  11  import {
  12    generateMosaicPuzzle,
  13    solveMosaic,
  14    solveMosaicBestStart,
  15    solveMosaicFree,
  16  } from "@/lib/api";
  17  import { applyMove, decodeBoard, encodeBoard, type Cell, type Grid } from "./solver";
  18  
  19  const PALETTE = [
  20    "#e15b5b",
  21    "#5b8ee1",
  22    "#6fd1a5",
  23    "#9b6fd1",
  24    "#3f3f52",
  25    "#e1c15b",
  26    "#e18ab0",
  27    "#5be1d1",
  28  ];
  29  
  30  const BLANK = -1;
  31  const MAX_BOARD_PX = 560;
  32  const ROW_LABEL_W = 26;
  33  const COL_LABEL_H = 20;
  34  const FULLSCREEN_RESERVE_W = 360 + 2 * ROW_LABEL_W;
  35  const FULLSCREEN_RESERVE_H = 190 + 2 * COL_LABEL_H;
  36  const STACKED_LAYOUT_MAX_WIDTH = 1024;
  37  // Page padding (32) + both row-label columns (52) + board border (6).
  38  const STACKED_RESERVE_W = 92;
  39  
  40  const LABEL_CLASSES =
  41    "flex items-center justify-center overflow-hidden text-[10px] font-medium text-ink-3";
  42  
  43  type Mode = "paint" | "seed";
  44  type Solving = "solve" | "findBest" | "free" | null;
  45  
  46  type SolutionMove = { r: number; c: number; color: number };
  47  
  48  interface SolutionState {
  49    moves: SolutionMove[];
  50    optimal: boolean;
  51    ms: number;
  52    regionsTried?: number;
  53    totalRegions?: number;
  54    freeCell?: boolean;
  55  }
  56  
  57  function movesFromColors(colors: number[], seed: Cell): SolutionMove[] {
  58    return colors.map((color) => ({ r: seed.r, c: seed.c, color }));
  59  }
  60  
  61  function blankGrid(rows: number, cols: number): Grid {
  62    return Array.from({ length: rows }, () => new Array(cols).fill(BLANK));
  63  }
  64  
  65  function randomGrid(rows: number, cols: number, numColors: number): Grid {
  66    return Array.from({ length: rows }, () =>
  67      Array.from({ length: cols }, () => Math.floor(Math.random() * numColors)),
  68    );
  69  }
  70  
  71  function cloneGrid(g: Grid): Grid {
  72    return g.map((row) => row.slice());
  73  }
  74  
  75  function clamp(v: number, lo: number, hi: number): number {
  76    return Math.max(lo, Math.min(hi, v));
  77  }
  78  
  79  function countBlank(grid: Grid): number {
  80    let n = 0;
  81    for (const row of grid) for (const v of row) if (v === BLANK) n++;
  82    return n;
  83  }
  84  
  85  function useLatest<T>(value: T) {
  86    const ref = useRef(value);
  87    useEffect(() => {
  88      ref.current = value;
  89    });
  90    return ref;
  91  }
  92  
  93  function useWindowSize() {
  94    const [size, setSize] = useState({ width: 0, height: 0 });
  95    useEffect(() => {
  96      const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
  97      update();
  98      window.addEventListener("resize", update);
  99      return () => window.removeEventListener("resize", update);
 100    }, []);
 101    return size;
 102  }
 103  
 104  export default function MosaicClient() {
 105    const [rowsStr, setRowsStr] = useState("8");
 106    const [colsStr, setColsStr] = useState("8");
 107    const [colorsStr, setColorsStr] = useState("4");
 108  
 109    const [rows, setRows] = useState(8);
 110    const [cols, setCols] = useState(8);
 111    const [colors, setColors] = useState<string[]>(PALETTE.slice(0, 4));
 112  
 113    const [grid, setGrid] = useState<Grid>(() => blankGrid(8, 8));
 114    const [originalGrid, setOriginalGrid] = useState<Grid>(() => blankGrid(8, 8));
 115    const [seed, setSeed] = useState<Cell>({ r: 0, c: 0 });
 116  
 117    const [mode, setMode] = useState<Mode>("paint");
 118    const [paintColor, setPaintColor] = useState(0);
 119  
 120    const [solution, setSolution] = useState<SolutionState | null>(null);
 121    const [solveError, setSolveError] = useState<string | null>(null);
 122    const [snapshots, setSnapshots] = useState<Grid[] | null>(null);
 123    const [stepIndex, setStepIndex] = useState(0);
 124  
 125    const [playing, setPlaying] = useState(false);
 126    const [speed, setSpeed] = useState(5);
 127    const [solving, setSolving] = useState<Solving>(null);
 128  
 129    const [targetMovesStr, setTargetMovesStr] = useState("6");
 130    const [generating, setGenerating] = useState(false);
 131    const [generateStatus, setGenerateStatus] = useState<string | null>(null);
 132    const [generateError, setGenerateError] = useState<string | null>(null);
 133  
 134    const [codeInput, setCodeInput] = useState("");
 135    const [codeError, setCodeError] = useState<string | null>(null);
 136    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
 137  
 138    const [fullscreen, setFullscreen] = useState(false);
 139    const windowSize = useWindowSize();
 140  
 141    const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 142    const mouseDownRef = useRef(false);
 143  
 144    useEffect(() => {
 145      const down = () => {
 146        mouseDownRef.current = true;
 147      };
 148      const up = () => {
 149        mouseDownRef.current = false;
 150      };
```

## Outgoing connections
- dispatch -> routers/mosaic.py (be:router:mosaic)
- call -> lib/api.ts (web:lib:api)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
