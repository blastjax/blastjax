# Node web:lotto: /lotto
Kind: module
Language: typescript, 2959 lines of code, location: web/src/app/lotto

Files in this directory (largest first):
- web/src/app/lotto/LottoClient.tsx
- web/src/app/lotto/page.tsx
- web/src/app/lotto/[gameSlug]/page.tsx

Source excerpt: web/src/app/lotto/LottoClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import Link from "next/link";
   5  import { AmountInput } from "@/components/AmountInput";
   6  import { DatePickerField } from "@/components/DatePickerField";
   7  import { ChevronRightIcon, PencilIcon, TrashIcon } from "@/components/Icons";
   8  import { PageHeader } from "@/components/PageHeader";
   9  import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
  10  import { Modal } from "@/components/Modal";
  11  import {
  12    createLottoAttempt,
  13    createLottoAttemptsBulk,
  14    deleteLottoAttempt,
  15    deleteLottoDraw,
  16    getLottoDraws,
  17    getLottoGames,
  18    importLottoDrawResultsText,
  19    setLottoDraw,
  20    updateLottoDraw,
  21    type LottoAttemptRow,
  22    type LottoDrawDetail,
  23  } from "@/lib/api";
  24  import {
  25    MONTH_NAMES_FULL,
  26    formatDate,
  27    formatDateLong,
  28    formatMonthDayShort,
  29    parseDateOnlyLocal,
  30  } from "@/lib/dateFormat";
  31  import { fmtCount, fmtJackpotCompact } from "@/lib/formatNumber";
  32  import { ErrorAlert } from "@/components/ErrorAlert";
  33  import {
  34    ACTION_BUTTON_CLASSES,
  35    ADD_BUTTON_CLASSES,
  36    CARD_CLASSES,
  37    DASHED_EMPTY_CLASSES,
  38    ICON_BUTTON_CLASSES,
  39    INPUT_CLASSES,
  40    PAGE_CONTAINER_CLASSES,
  41    PRIMARY_BUTTON_CLASSES,
  42    SECONDARY_BUTTON_CLASSES,
  43    alertClasses,
  44  } from "@/lib/ui";
  45  import {
  46    DIALOG_BODY_CLASSES,
  47    DIALOG_CLASSES,
  48    DIALOG_FOOTER_CLASSES,
  49    Field,
  50    ModalHeader,
  51    Pill,
  52    Segmented,
  53  } from "@/components/FinanceUI";
  54  
  55  const NUMBERS_HELP =
  56    "6 unique numbers, 1-58 — separate with commas, spaces, or dashes (e.g. 3, 17, 29, 42, 58, 1 or 03-17-29-42-58-01)";
  57  
  58  function parseNumbers(text: string): number[] {
  59    const parts = text.split(/[^0-9]+/).filter((p) => p.length > 0);
  60    if (parts.length !== 6) {
  61      throw new Error("Enter exactly 6 numbers.");
  62    }
  63    const numbers = parts.map((p) => Number(p));
  64    if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 58)) {
  65      throw new Error("Each number must be a whole number between 1 and 58.");
  66    }
  67    if (new Set(numbers).size !== numbers.length) {
  68      throw new Error("Numbers must be unique.");
  69    }
  70    return [...numbers].sort((a, b) => a - b);
  71  }
  72  
  73  function numbersToText(numbers: number[]): string {
  74    return numbers.join(", ");
  75  }
  76  
  77  function numbersToDashString(numbers: number[]): string {
  78    return numbers.map((n) => String(n).padStart(2, "0")).join("-");
  79  }
  80  
  81  function isoToExportDate(iso: string): string {
  82    const [y, m, d] = iso.split("-").map(Number);
  83    return `${m}/${d}/${y}`;
  84  }
  85  
  86  function downloadTextFile(filename: string, text: string): void {
  87    const blob = new Blob([text], { type: "text/plain" });
  88    const url = URL.createObjectURL(blob);
  89    const a = document.createElement("a");
  90    a.href = url;
  91    a.download = filename;
  92    document.body.appendChild(a);
  93    a.click();
  94    a.remove();
  95    URL.revokeObjectURL(url);
  96  }
  97  
  98  type WhatIfMatch = {
  99    key: string;
 100    attempt: LottoAttemptRow;
 101    numbers: number[];
 102    loggedDrawId: string;
 103    loggedDrawDate: string;
 104    matchedDrawDate: string;
 105  };
 106  
 107  function findWhatIfMatches(draws: LottoDrawDetail[]): WhatIfMatch[] {
 108    const resultsByKey = new Map<string, { id: string; date: string }[]>();
 109    for (const detail of draws) {
 110      if (detail.draw.numbers.length !== 6) continue;
 111      const key = [...detail.draw.numbers].sort((a, b) => a - b).join("-");
 112      const hits = resultsByKey.get(key);
 113      const entry = { id: detail.draw.id, date: detail.draw.draw_date };
 114      if (hits) hits.push(entry);
 115      else resultsByKey.set(key, [entry]);
 116    }
 117  
 118    const matches: WhatIfMatch[] = [];
 119    for (const detail of draws) {
 120      for (const attempt of detail.attempts) {
 121        const key = [...attempt.numbers].sort((a, b) => a - b).join("-");
 122        for (const hit of resultsByKey.get(key) ?? []) {
 123          if (hit.id === detail.draw.id) continue;
 124          matches.push({
 125            key: `${attempt.id}-${hit.id}`,
 126            attempt,
 127            numbers: attempt.numbers,
 128            loggedDrawId: detail.draw.id,
 129            loggedDrawDate: detail.draw.draw_date,
 130            matchedDrawDate: hit.date,
 131          });
 132        }
 133      }
 134    }
 135    return matches.sort((a, b) => b.matchedDrawDate.localeCompare(a.matchedDrawDate));
 136  }
 137  
 138  type ExportFields = { numbers: string; date: string; jackpot: string; winners: string };
 139  
 140  function drawToExportFields(detail: LottoDrawDetail): ExportFields | null {
 141    if (detail.draw.numbers.length !== 6) return null;
 142    const jackpot = (detail.draw.jackpot_prize ?? 0).toLocaleString("en-US", {
 143      minimumFractionDigits: 2,
 144      maximumFractionDigits: 2,
 145    });
 146    return {
 147      numbers: numbersToDashString(detail.draw.numbers),
 148      date: isoToExportDate(detail.draw.draw_date),
 149      jackpot,
 150      winners: String(detail.draw.winners),
```

## Outgoing connections
- dispatch -> routers/lotto.py (be:router:lotto)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/CalendarMonth.tsx (web:components:CalendarMonth)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/DatePickerField.tsx (web:components:DatePickerField)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
