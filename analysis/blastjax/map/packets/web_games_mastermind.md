# Node web:games/mastermind: /games/mastermind
Kind: module
Language: typescript, 598 lines of code, location: web/src/app/games/mastermind

Files in this directory (largest first):
- web/src/app/games/mastermind/MastermindClient.tsx
- web/src/app/games/mastermind/logic.ts
- web/src/app/games/mastermind/page.tsx

Source excerpt: web/src/app/games/mastermind/MastermindClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { PageHeader } from "@/components/PageHeader";
   4  import { useMemo, useState } from "react";
   5  import {
   6    ACTION_BUTTON_CLASSES,
   7    CARD_CLASSES,
   8    INPUT_CLASSES,
   9    PAGE_CONTAINER_CLASSES,
  10    PRIMARY_BUTTON_CLASSES,
  11  } from "@/lib/ui";
  12  import {
  13    allCodes,
  14    cycleFeedbackPeg,
  15    emptyAttempt,
  16    feedbackFromPegs,
  17    filterCandidates,
  18    FB_COLOR_ONLY,
  19    FB_EXACT,
  20    MAX_ATTEMPTS,
  21    MAX_COLORS,
  22    MIN_COLORS,
  23    CODE_LENGTH,
  24    COLOR_PALETTE,
  25    EMPTY_PEG,
  26    openingGuess,
  27    pickNextGuess,
  28    type Attempt,
  29    type CodeArr,
  30  } from "./logic";
  31  
  32  const COLOR_COUNTS = Array.from(
  33    { length: MAX_COLORS - MIN_COLORS + 1 },
  34    (_, i) => MIN_COLORS + i,
  35  );
  36  
  37  const BANNER_TONE_CLASSES: Record<"good" | "bad" | "warn", string> = {
  38    good: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  39    bad: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  40    warn: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  41  };
  42  
  43  function colorHex(v: number, colorMap: number[]): string {
  44    return v < 0 ? "transparent" : COLOR_PALETTE[colorMap[v]].hex;
  45  }
  46  
  47  function colorName(v: number, colorMap: number[]): string {
  48    return v < 0 ? "empty" : COLOR_PALETTE[colorMap[v]].name;
  49  }
  50  
  51  export default function MastermindClient() {
  52    const [numColors, setNumColorsState] = useState(6);
  53    const [attempts, setAttempts] = useState<Attempt[]>(() =>
  54      Array.from({ length: MAX_ATTEMPTS }, emptyAttempt),
  55    );
  56    const [submittedCount, setSubmittedCount] = useState(0);
  57    const [pointer, setPointer] = useState(0);
  58    const [colorMap, setColorMap] = useState<number[]>(() =>
  59      COLOR_PALETTE.map((_, i) => i),
  60    );
  61  
  62    const codeSpace = useMemo(() => allCodes(numColors), [numColors]);
  63  
  64    const remaining = useMemo(() => {
  65      let cands: CodeArr[] = codeSpace;
  66      for (let i = 0; i < submittedCount; i++) {
  67        cands = filterCandidates(cands, attempts[i].guess, feedbackFromPegs(attempts[i].feedbackPegs));
  68      }
  69      return cands;
  70    }, [codeSpace, attempts, submittedCount]);
  71  
  72    const lastAttempt = submittedCount > 0 ? attempts[submittedCount - 1] : null;
  73    const lastFeedback = lastAttempt ? feedbackFromPegs(lastAttempt.feedbackPegs) : null;
  74    const solved = lastFeedback != null && lastFeedback.exact === CODE_LENGTH;
  75    const outOfAttempts = !solved && submittedCount >= MAX_ATTEMPTS;
  76    const gameOver = solved || outOfAttempts;
  77    const contradiction = remaining.length === 0;
  78  
  79    const suggestion = useMemo<CodeArr | null>(() => {
  80      if (gameOver || contradiction) return null;
  81      if (submittedCount === 0) return openingGuess(numColors);
  82      return pickNextGuess(remaining);
  83    }, [gameOver, contradiction, submittedCount, numColors, remaining]);
  84  
  85    const activeIdx = submittedCount < MAX_ATTEMPTS ? submittedCount : MAX_ATTEMPTS - 1;
  86    const activeStored = attempts[activeIdx];
  87    const activeIsBlank = activeStored.guess.every((v) => v === EMPTY_PEG);
  88    const activeGuessDisplay =
  89      !gameOver && activeIsBlank && suggestion ? suggestion : activeStored.guess;
  90    const activeGuessComplete = activeGuessDisplay.every((v) => v !== EMPTY_PEG);
  91  
  92    function resetGame() {
  93      setAttempts(Array.from({ length: MAX_ATTEMPTS }, emptyAttempt));
  94      setSubmittedCount(0);
  95      setPointer(0);
  96    }
  97  
  98    function setNumColors(n: number) {
  99      setNumColorsState(n);
 100      resetGame();
 101    }
 102  
 103    function selectPeg(pos: number) {
 104      if (gameOver) return;
 105      setPointer(pos);
 106    }
 107  
 108    function placeColorAtPointer(colorIdx: number) {
 109      if (gameOver) return;
 110      setAttempts((prev) => {
 111        const next = prev.slice();
 112        const stored = next[activeIdx];
 113        const base = (stored.guess.every((v) => v === EMPTY_PEG) && suggestion
 114          ? suggestion
 115          : stored.guess
 116        ).slice();
 117        base[pointer] = colorIdx;
 118        next[activeIdx] = { ...stored, guess: base };
 119        return next;
 120      });
 121      setPointer((p) => (p + 1) % CODE_LENGTH);
 122    }
 123  
 124    function cycleLegendColor(slot: number) {
 125      setColorMap((prev) => {
 126        const next = prev.slice();
 127        next[slot] = (next[slot] + 1) % COLOR_PALETTE.length;
 128        return next;
 129      });
 130    }
 131  
 132    function handleLegendClick(slot: number, e: React.MouseEvent) {
 133      if (e.detail >= 2) {
 134        cycleLegendColor(slot);
 135      } else {
 136        placeColorAtPointer(slot);
 137      }
 138    }
 139  
 140    function cycleFeedbackAt(rowIdx: number, pos: number) {
 141      if (rowIdx >= submittedCount) return;
 142      setAttempts((prev) => {
 143        const next = prev.slice();
 144        const stored = next[rowIdx];
 145        const pegs = stored.feedbackPegs.slice();
 146        pegs[pos] = cycleFeedbackPeg(pegs[pos]);
 147        next[rowIdx] = { ...stored, feedbackPegs: pegs };
 148        return next;
 149      });
 150    }
```

## Outgoing connections
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
