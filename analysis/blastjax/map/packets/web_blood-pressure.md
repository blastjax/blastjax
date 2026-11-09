# Node web:blood-pressure: /blood-pressure
Kind: module
Language: typescript, 558 lines of code, location: web/src/app/blood-pressure

Files in this directory (largest first):
- web/src/app/blood-pressure/BloodPressureClient.tsx
- web/src/app/blood-pressure/page.tsx

Source excerpt: web/src/app/blood-pressure/BloodPressureClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { useCallback, useEffect, useMemo, useState } from "react";
   5  import {
   6    CartesianGrid,
   7    Legend,
   8    Line,
   9    LineChart,
  10    ReferenceArea,
  11    ResponsiveContainer,
  12    Tooltip,
  13    XAxis,
  14    YAxis,
  15  } from "recharts";
  16  import { ChartZoomControls } from "@/components/ChartZoomControls";
  17  import {
  18    DIALOG_BODY_CLASSES,
  19    DIALOG_CLASSES,
  20    DIALOG_FOOTER_CLASSES,
  21    EmptyState,
  22    Field,
  23    IconAction,
  24    LoadingBlocks,
  25    Metric,
  26    ModalHeader,
  27    Panel,
  28    Pill,
  29    Segmented,
  30    StatStrip,
  31  } from "@/components/FinanceUI";
  32  import { HeartPulseIcon, PlusIcon } from "@/components/Icons";
  33  import { Modal } from "@/components/Modal";
  34  import { PageHeader } from "@/components/PageHeader";
  35  import { useTheme } from "@/components/ThemeProvider";
  36  import {
  37    createBloodPressure,
  38    deleteBloodPressure,
  39    getBloodPressures,
  40    updateBloodPressure,
  41    type BloodPressureCreateBody,
  42    type BloodPressureRow,
  43  } from "@/lib/api";
  44  import { chartScrollMinWidth, xAxisTickInterval } from "@/lib/chartAxis";
  45  import { getChartTooltipStyle } from "@/lib/chartTooltipStyle";
  46  import { formatDateTime, formatMonthDayShort } from "@/lib/dateFormat";
  47  import { ErrorAlert } from "@/components/ErrorAlert";
  48  import {
  49    DASHED_EMPTY_CLASSES,
  50    INPUT_CLASSES,
  51    PAGE_CONTAINER_CLASSES,
  52    PRIMARY_BUTTON_CLASSES,
  53    SECONDARY_BUTTON_CLASSES,
  54    SECTION_LABEL_CLASSES,
  55    TABLE_CELL_CLASSES,
  56    TABLE_HEAD_CELL_CLASSES,
  57    TABLE_HEAD_ROW_CLASSES,
  58    TABLE_ROW_CLASSES,
  59  } from "@/lib/ui";
  60  import { useChartZoom } from "@/lib/useChartZoom";
  61  
  62  type Field = "systolic" | "diastolic" | "pulse" | "spo2" | "temperature" | "weight";
  63  
  64  const NORMAL: Partial<Record<Field, readonly [number, number]>> = {
  65    systolic: [90, 119],
  66    diastolic: [60, 79],
  67    pulse: [60, 100],
  68    spo2: [95, 100],
  69  };
  70  
  71  function outOfRange(field: Field, v: number | null): boolean {
  72    const band = NORMAL[field];
  73    return v != null && band != null && (v < band[0] || v > band[1]);
  74  }
  75  
  76  function verdict(r: BloodPressureRow): boolean | null {
  77    if (r.systolic == null || r.diastolic == null || r.pulse == null) return null;
  78    return !(Object.keys(NORMAL) as Field[]).some((f) => outOfRange(f, r[f]));
  79  }
  80  
  81  type ChartMetric = {
  82    tab: string;
  83    label: string;
  84    unit: string;
  85    digits: number;
  86    lines: { key: Field; name: string; color: string }[];
  87  };
  88  
  89  const METRICS: ChartMetric[] = [
  90    {
  91      tab: "BP",
  92      label: "Blood pressure",
  93      unit: "mmHg",
  94      digits: 0,
  95      lines: [
  96        { key: "systolic", name: "Systolic", color: "#ef4444" },
  97        { key: "diastolic", name: "Diastolic", color: "#6366f1" },
  98      ],
  99    },
 100    { tab: "Pulse", label: "Pulse", unit: "bpm", digits: 0, lines: [{ key: "pulse", name: "Pulse", color: "#10b981" }] },
 101    { tab: "SpO2", label: "SpO2", unit: "%", digits: 0, lines: [{ key: "spo2", name: "SpO2", color: "#0ea5e9" }] },
 102    { tab: "Temp", label: "Temperature", unit: "°C", digits: 1, lines: [{ key: "temperature", name: "Temperature", color: "#f97316" }] },
 103    { tab: "Weight", label: "Weight", unit: "kg", digits: 1, lines: [{ key: "weight", name: "Weight", color: "#a855f7" }] },
 104  ];
 105  
 106  const fmt = (v: number | null, digits: number) =>
 107    v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
 108  
 109  function metricValue(m: ChartMetric, r: BloodPressureRow): string | null {
 110    if (r[m.lines[0].key] == null) return null;
 111    return m.lines.map((l) => fmt(r[l.key], m.digits)).join("/");
 112  }
 113  
 114  function metricOut(m: ChartMetric, r: BloodPressureRow): boolean {
 115    return m.lines.some((l) => outOfRange(l.key, r[l.key]));
 116  }
 117  
 118  type FormField = {
 119    key: Field;
 120    label: string;
 121    unit: string;
 122    min: number;
 123    max: number;
 124    step?: number;
 125    placeholder: string;
 126  };
 127  
 128  const BP_FIELDS: FormField[] = [
 129    { key: "systolic", label: "Systolic", unit: "mmHg", min: 1, max: 400, placeholder: "120" },
 130    { key: "diastolic", label: "Diastolic", unit: "mmHg", min: 1, max: 400, placeholder: "80" },
 131    { key: "pulse", label: "Pulse", unit: "bpm", min: 1, max: 400, placeholder: "72" },
 132  ];
 133  const OTHER_FIELDS: FormField[] = [
 134    { key: "spo2", label: "SpO2", unit: "%", min: 1, max: 100, placeholder: "98" },
 135    { key: "temperature", label: "Temp", unit: "°C", min: 26, max: 45, step: 0.1, placeholder: "36.6" },
 136    { key: "weight", label: "Weight", unit: "kg", min: 0.1, max: 500, step: 0.1, placeholder: "70.0" },
 137  ];
 138  
 139  const emptyForm: Record<Field | "notes", string> = {
 140    systolic: "",
 141    diastolic: "",
 142    pulse: "",
 143    spo2: "",
 144    temperature: "",
 145    weight: "",
 146    notes: "",
 147  };
 148  
 149  const num = (s: string) => (s.trim() === "" ? null : Number(s));
 150  const str = (v: number | null) => (v == null ? "" : String(v));
```

## Outgoing connections
- dispatch -> routers/blood_pressure.py (be:router:blood_pressure)
- call -> components/ChartZoomControls.tsx (web:components:ChartZoomControls)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> components/ThemeProvider.tsx (web:components:ThemeProvider)
- call -> lib/api.ts (web:lib:api)
- call -> lib/chartAxis.ts (web:lib:chartAxis)
- call -> lib/chartTooltipStyle.ts (web:lib:chartTooltipStyle)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/ui.ts (web:lib:ui)
- call -> lib/useChartZoom.ts (web:lib:useChartZoom)

## Incoming connections
- none
