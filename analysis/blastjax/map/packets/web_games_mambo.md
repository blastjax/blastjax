# Node web:games/mambo: /games/mambo
Kind: module
Language: typescript, 1147 lines of code, location: web/src/app/games/mambo

Files in this directory (largest first):
- web/src/app/games/mambo/MamboClient.tsx
- web/src/app/games/mambo/logic.ts
- web/src/app/games/mambo/page.tsx

Source excerpt: web/src/app/games/mambo/MamboClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { useCallback, useEffect, useMemo, useRef, useState } from "react";
   4  import {
   5    ACTION_BUTTON_CLASSES,
   6    CARD_CLASSES,
   7    INPUT_CLASSES,
   8    PRIMARY_BUTTON_CLASSES,
   9    SECONDARY_BUTTON_CLASSES,
  10  } from "@/lib/ui";
  11  import {
  12    generateMamboPuzzle,
  13    solveMambo,
  14    solveMamboSteps,
  15    type MamboBoard,
  16    type MamboDifficulty,
  17    type MamboStep,
  18  } from "@/lib/api";
  19  import {
  20    CIRCLE,
  21    EMPTY,
  22    SIGN_GLYPHS,
  23    SIGN_NONE,
  24    SYMBOL_LABELS,
  25    cellKey,
  26    cloneGrid,
  27    colCounts,
  28    countFilled,
  29    decodePuzzle,
  30    emptyGrid,
  31    emptyHSigns,
  32    emptyVSigns,
  33    encodePuzzle,
  34    findConflicts,
  35    isComplete,
  36    nextSign,
  37    nextValue,
  38    prevValue,
  39    rowCounts,
  40    type Grid,
  41    type SignGrid,
  42  } from "./logic";
  43  
  44  const SIDES = [4, 6, 8, 10, 12, 14, 16] as const;
  45  const DIFFICULTIES: readonly MamboDifficulty[] = ["easy", "medium", "hard"];
  46  
  47  const CIRCLE_COLOR = "#6366f1";
  48  const SQUARE_COLOR = "#f59e0b";
  49  
  50  const MAX_BOARD_PX = 560;
  51  const ROW_LABEL_W = 26;
  52  const COL_LABEL_H = 18;
  53  const FULLSCREEN_RESERVE_W = 380 + 2 * ROW_LABEL_W;
  54  const FULLSCREEN_RESERVE_H = 170 + 2 * COL_LABEL_H;
  55  const STACKED_LAYOUT_MAX_WIDTH = 1024;
  56  // Page padding (32) + both row-label columns (52) + board frames (42).
  57  const STACKED_RESERVE_W = 130;
  58  
  59  type Busy = "solve" | "steps" | "hint" | null;
  60  
  61  const TECHNIQUE_LABELS: Record<string, string> = {
  62    "sign-equal": "= sign",
  63    "sign-opposite": "✕ sign",
  64    pair: "Pair",
  65    sandwich: "Sandwich",
  66    count: "Line full",
  67    elimination: "Only option",
  68    deep: "Look ahead",
  69  };
  70  
  71  function techniqueLabel(technique: string): string {
  72    return TECHNIQUE_LABELS[technique] ?? technique;
  73  }
  74  
  75  function useLatest<T>(value: T) {
  76    const ref = useRef(value);
  77    useEffect(() => {
  78      ref.current = value;
  79    });
  80    return ref;
  81  }
  82  
  83  function useWindowSize() {
  84    const [size, setSize] = useState({ width: 0, height: 0 });
  85    useEffect(() => {
  86      const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
  87      update();
  88      window.addEventListener("resize", update);
  89      return () => window.removeEventListener("resize", update);
  90    }, []);
  91    return size;
  92  }
  93  
  94  function SymbolMark({ value, faded }: { value: number; faded: boolean }) {
  95    if (value === EMPTY) return null;
  96    const circle = value === CIRCLE;
  97    return (
  98      <span
  99        className={`pointer-events-none block ${circle ? "rounded-full" : "rounded-[20%]"}`}
 100        style={{
 101          width: circle ? "62%" : "58%",
 102          height: circle ? "62%" : "58%",
 103          background: circle ? CIRCLE_COLOR : SQUARE_COLOR,
 104          opacity: faded ? 0.72 : 1,
 105        }}
 106      />
 107    );
 108  }
 109  
 110  export default function MamboClient() {
 111    const [rows, setRows] = useState(8);
 112    const [cols, setCols] = useState(8);
 113  
 114    const [puzzle, setPuzzle] = useState<Grid>(() => emptyGrid(8, 8));
 115    const [grid, setGrid] = useState<Grid>(() => emptyGrid(8, 8));
 116    const [hSigns, setHSigns] = useState<SignGrid>(() => emptyHSigns(8, 8));
 117    const [vSigns, setVSigns] = useState<SignGrid>(() => emptyVSigns(8, 8));
 118  
 119    const [difficulty, setDifficulty] = useState<MamboDifficulty>("medium");
 120    const [generating, setGenerating] = useState(false);
 121    const [generateStatus, setGenerateStatus] = useState<string | null>(null);
 122    const [generateError, setGenerateError] = useState<string | null>(null);
 123  
 124    const [steps, setSteps] = useState<MamboStep[] | null>(null);
 125    const [stepIndex, setStepIndex] = useState(0);
 126    const [solveStatus, setSolveStatus] = useState<string | null>(null);
 127    const [solveError, setSolveError] = useState<string | null>(null);
 128    const [busy, setBusy] = useState<Busy>(null);
 129  
 130    const [playing, setPlaying] = useState(false);
 131    const [speed, setSpeed] = useState(6);
 132  
 133    const [codeInput, setCodeInput] = useState("");
 134    const [codeError, setCodeError] = useState<string | null>(null);
 135    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
 136  
 137    const [fullscreen, setFullscreen] = useState(false);
 138    const windowSize = useWindowSize();
 139  
 140    const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
 141  
 142    const stopPlaying = useCallback(() => {
 143      setPlaying(false);
 144      if (playTimerRef.current) {
 145        clearInterval(playTimerRef.current);
 146        playTimerRef.current = null;
 147      }
 148    }, []);
 149  
 150    useEffect(() => stopPlaying, [stopPlaying]);
```

## Outgoing connections
- dispatch -> routers/mambo.py (be:router:mambo)
- call -> lib/api.ts (web:lib:api)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
