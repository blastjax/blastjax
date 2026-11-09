# Node web:commission: /commission
Kind: module
Language: typescript, 727 lines of code, location: web/src/app/commission

Files in this directory (largest first):
- web/src/app/commission/CommissionClient.tsx
- web/src/app/commission/commissionForecast.ts
- web/src/app/commission/[company]/page.tsx
- web/src/app/commission/page.tsx

Source excerpt: web/src/app/commission/CommissionClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { useCallback, useEffect, useMemo, useState } from "react";
   4  import { getPayslips, type PayslipRow } from "@/lib/api";
   5  import { fmtAmount as fmt } from "@/lib/formatNumber";
   6  import { MONTH_NAMES_FULL as MF, MONTH_NAMES_SHORT as MN } from "@/lib/dateFormat";
   7  import { ErrorAlert } from "@/components/ErrorAlert";
   8  import { EmptyState, LoadingBlocks } from "@/components/FinanceUI";
   9  import { useWheelStep } from "@/lib/useWheelStep";
  10  import { ChevronDownIcon, ChevronUpIcon, TrendingUpIcon } from "@/components/Icons";
  11  import {
  12    Chip,
  13    Segmented,
  14    STATS_CARD_CLASSES,
  15    STATS_H2_CLASSES,
  16    STATS_PAGE_CLASSES,
  17    STATS_SUB_CLASSES,
  18    STATS_TICK_CLASSES,
  19    STATS_TIP_CLASSES,
  20    STATS_XLABEL_CLASSES,
  21    StatsHeader,
  22    YearStepper,
  23    fk,
  24    niceStep,
  25    pctOf,
  26    useWidth,
  27    xLabels,
  28  } from "@/components/StatsPage";
  29  import { buildForecast, monthlyCommission, type MonthValue } from "./commissionForecast";
  30  
  31  const YEAR_COLORS = ["#60a5fa", "#fb923c", "#2dd4bf", "#fbbf24", "#f472b6", "#4ade80"];
  32  
  33  const HORIZONS = [
  34    { value: 3, label: "3 mo" },
  35    { value: 6, label: "6 mo" },
  36    { value: 12, label: "12 mo" },
  37  ] as const;
  38  type Horizon = (typeof HORIZONS)[number]["value"];
  39  
  40  const RANGES = [
  41    { value: "Year", label: "Year" },
  42    { value: "12M", label: "12 mo" },
  43    { value: "24M", label: "24 mo" },
  44    { value: "All", label: "All" },
  45  ] as const;
  46  type Range = (typeof RANGES)[number]["value"];
  47  
  48  const VIEWS = [
  49    { value: "heat", label: "Heatmap" },
  50    { value: "lines", label: "Lines" },
  51  ] as const;
  52  type View = (typeof VIEWS)[number]["value"];
  53  
  54  const DESCRIPTION = "Track commission earned per month and forecast what's still to come.";
  55  
  56  const signedPct = (cur: number, base: number) =>
  57    `${cur >= base ? "+" : "−"}${Math.abs(((cur - base) / base) * 100).toFixed(1)}%`;
  58  
  59  export default function CommissionClient({ company = "Sophos" }: { company?: string }) {
  60    const [rows, setRows] = useState<PayslipRow[]>([]);
  61    const [loading, setLoading] = useState(true);
  62    const [error, setError] = useState<string | null>(null);
  63  
  64    const load = useCallback(async () => {
  65      setError(null);
  66      setLoading(true);
  67      try {
  68        const r = await getPayslips(2000, company);
  69        setRows(r.payslips);
  70      } catch (e) {
  71        setError(e instanceof Error ? e.message : "Failed to load payslips");
  72        setRows([]);
  73      } finally {
  74        setLoading(false);
  75      }
  76    }, [company]);
  77  
  78    useEffect(() => {
  79      void load();
  80    }, [load]);
  81  
  82    const hist = useMemo(() => monthlyCommission(rows), [rows]);
  83  
  84    if (loading || error || hist.length === 0) {
  85      return (
  86        <div className={STATS_PAGE_CLASSES}>
  87          <StatsHeader company={company} title="Commission" description={DESCRIPTION} />
  88          {error ? (
  89            <ErrorAlert>{error}</ErrorAlert>
  90          ) : loading ? (
  91            <LoadingBlocks label="Loading payslips…" />
  92          ) : (
  93            <EmptyState icon={<TrendingUpIcon className="size-6" />} title="No commission history yet">
  94              Add payslip entries with a commission amount to see a forecast here.
  95            </EmptyState>
  96          )}
  97        </div>
  98      );
  99    }
 100    return <CommissionView company={company} hist={hist} />;
 101  }
 102  
 103  function CommissionView({ company, hist }: { company: string; hist: MonthValue[] }) {
 104    const last = hist[hist.length - 1]!;
 105    const [h, setH] = useState<Horizon>(6);
 106    const [cRange, setCRange] = useState<Range>("Year");
 107    const [cYear, setCYear] = useState(last.y);
 108    const [cHover, setCHover] = useState<number | null>(null);
 109    const [view, setView] = useState<View>("heat");
 110    const [hiddenYears, setHiddenYears] = useState<ReadonlySet<number>>(() => new Set());
 111    const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set([0]));
 112    const [chartRef, W] = useWidth();
 113    const [linesRef, LW] = useWidth();
 114  
 115    const byIndex = useMemo(() => new Map(hist.map((d) => [d.y * 12 + d.m, d.v])), [hist]);
 116    const cv = (y: number, m: number) => byIndex.get(y * 12 + m) ?? null;
 117    const fc = useMemo(() => buildForecast(hist, h), [hist, h]);
 118    const hfc = useMemo(() => buildForecast(hist, 23 - last.m), [hist, last.m]);
 119    const years = [...new Set(hist.map((d) => d.y))];
 120  
 121    const f0 = fc[0]!;
 122    const fLast = fc[fc.length - 1]!;
 123    const ly0 = cv(f0.y - 1, f0.m);
 124    const ytd = hist.filter((d) => d.y === last.y);
 125    const ytdSum = ytd.reduce((a, d) => a + d.v, 0);
 126    const lySum = ytd.reduce((a, d) => a + (cv(d.y - 1, d.m) ?? 0), 0);
 127    const avg = hist.reduce((a, d) => a + d.v, 0) / hist.length;
 128    const growthPct = `${signedPct(f0.growth, 1)}/yr`;
 129    const kpis = [
 130      {
 131        label: `Next month · ${MF[f0.m]} ${f0.y}`,
 132        value: fmt(f0.v),
 133        sub: ly0 != null ? `Predicted · ${MN[f0.m]} ${f0.y - 1} was ${fmt(ly0)}` : "Predicted",
 134        accent: true,
 135      },
 136      {
 137        label: `Next ${h} months`,
 138        value: fmt(fc.reduce((a, f) => a + f.v, 0)),
 139        sub: `Predicted total · ${MN[f0.m]} ${f0.y} – ${MN[fLast.m]} ${fLast.y}`,
 140      },
 141      {
 142        label: `${last.y} so far`,
 143        value: fmt(ytdSum),
 144        sub: lySum
 145          ? `${signedPct(ytdSum, lySum)} vs ${MN[ytd[0]!.m]}–${MN[last.m]} ${last.y - 1}`
 146          : `No ${last.y - 1} data to compare`,
 147      },
 148      { label: "Monthly average", value: fmt(avg), sub: `All-time, across ${hist.length} months` },
 149    ];
 150  
```

## Outgoing connections
- dispatch -> routers/payslip.py (be:router:payslip)
- call -> components/CompanyRedirect.tsx (web:components:CompanyRedirect)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/StatsPage.tsx (web:components:StatsPage)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/useWheelStep.ts (web:lib:useWheelStep)

## Incoming connections
- none
