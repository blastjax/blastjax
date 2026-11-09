# Node web:salary-stats: /salary-stats
Kind: module
Language: typescript, 596 lines of code, location: web/src/app/salary-stats

Files in this directory (largest first):
- web/src/app/salary-stats/SalaryStatsClient.tsx
- web/src/app/salary-stats/[company]/page.tsx
- web/src/app/salary-stats/page.tsx

Source excerpt: web/src/app/salary-stats/SalaryStatsClient.tsx (first 150 lines)
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
  10  import { ArrowDownRightIcon, ArrowUpRightIcon, ChartBarIcon } from "@/components/Icons";
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
  29  import { calendarMonthIndex } from "@/app/payslip/payslipAggregates";
  30  
  31  const INC = [
  32    { k: "basic_salary", n: "Basic salary", c: "#10b981" },
  33    { k: "commission", n: "Commission", c: "#0ea5e9" },
  34    { k: "thirteenth_month", n: "13th month", c: "#a3e635" },
  35    { k: "others", n: "Others", c: "#818cf8" },
  36    { k: "allowances", n: "Allowances", c: "#22d3ee" },
  37    { k: "reimbursement", n: "Reimbursement", c: "#c084fc" },
  38    { k: "medical_reimbursement", n: "Medical reimbursement", c: "#5eead4" },
  39  ] as const;
  40  
  41  const DED = [
  42    { k: "withholding_tax", n: "Withholding tax", c: "#f43f5e" },
  43    { k: "mp2", n: "MP2", c: "#fb923c" },
  44    { k: "philhealth", n: "PhilHealth", c: "#facc15" },
  45    { k: "sss_contribution", n: "SSS contribution", c: "#f472b6" },
  46    { k: "pag_ibig", n: "Pag-IBIG", c: "#fca5a5" },
  47    { k: "bereavement_asst", n: "Bereavement asst", c: "#e879f9" },
  48  ] as const;
  49  
  50  type Series = (typeof INC)[number] | (typeof DED)[number];
  51  type Key = Series["k"];
  52  type Month = { y: number; m: number } & Record<Key, number>;
  53  
  54  const ALL: readonly Series[] = [...INC, ...DED];
  55  
  56  function blankMonth(t: number): Month {
  57    const d = { y: Math.floor(t / 12), m: t % 12 } as Month;
  58    for (const s of ALL) d[s.k] = 0;
  59    return d;
  60  }
  61  
  62  function buildMonths(rows: PayslipRow[]): Month[] {
  63    const byT = new Map<number, Month>();
  64    for (const r of rows) {
  65      const t = calendarMonthIndex(r);
  66      if (t == null) continue;
  67      let d = byT.get(t);
  68      if (!d) byT.set(t, (d = blankMonth(t)));
  69      for (const s of ALL) {
  70        const v = r[s.k];
  71        if (v != null && Number.isFinite(v)) d[s.k] += v;
  72      }
  73    }
  74    if (byT.size === 0) return [];
  75    const ts = [...byT.keys()];
  76    const hi = Math.max(...ts);
  77    const out: Month[] = [];
  78    for (let t = Math.min(...ts); t <= hi; t++) out.push(byT.get(t) ?? blankMonth(t));
  79    return out;
  80  }
  81  
  82  const sum = (list: readonly Month[], k: Key) => list.reduce((a, d) => a + d[k], 0);
  83  const gross = (list: readonly Month[]) => INC.reduce((a, s) => a + sum(list, s.k), 0);
  84  const deds = (list: readonly Month[]) => DED.reduce((a, s) => a + sum(list, s.k), 0);
  85  
  86  const RANGES = [
  87    { value: "Year", label: "Year" },
  88    { value: "12M", label: "12 mo" },
  89    { value: "24M", label: "24 mo" },
  90    { value: "36M", label: "36 mo" },
  91    { value: "All", label: "All" },
  92  ] as const;
  93  type Range = (typeof RANGES)[number]["value"];
  94  
  95  const DESCRIPTION = "Compare income and deductions across months and years.";
  96  
  97  export default function SalaryStatsClient({ company = "Sophos" }: { company?: string }) {
  98    const [rows, setRows] = useState<PayslipRow[]>([]);
  99    const [loading, setLoading] = useState(true);
 100    const [error, setError] = useState<string | null>(null);
 101  
 102    const load = useCallback(async () => {
 103      setError(null);
 104      setLoading(true);
 105      try {
 106        const r = await getPayslips(2000, company);
 107        setRows(r.payslips);
 108      } catch (e) {
 109        setError(e instanceof Error ? e.message : "Failed to load payslips");
 110        setRows([]);
 111      } finally {
 112        setLoading(false);
 113      }
 114    }, [company]);
 115  
 116    useEffect(() => {
 117      void load();
 118    }, [load]);
 119  
 120    const data = useMemo(() => buildMonths(rows), [rows]);
 121  
 122    if (loading || error || data.length === 0) {
 123      return (
 124        <div className={STATS_PAGE_CLASSES}>
 125          <StatsHeader company={company} title="Salary Stats" description={DESCRIPTION} />
 126          {error ? (
 127            <ErrorAlert>{error}</ErrorAlert>
 128          ) : loading ? (
 129            <LoadingBlocks label="Loading payslips…" />
 130          ) : (
 131            <EmptyState icon={<ChartBarIcon className="size-6" />} title="No payslips yet">
 132              Add some to see stats here.
 133            </EmptyState>
 134          )}
 135        </div>
 136      );
 137    }
 138    return <SalaryStatsView company={company} data={data} />;
 139  }
 140  
 141  function SalaryStatsView({ company, data }: { company: string; data: Month[] }) {
 142    const yrs = useMemo(() => [...new Set(data.map((d) => d.y))], [data]);
 143    const firstYear = yrs[0]!;
 144    const lastYear = yrs[yrs.length - 1]!;
 145  
 146    const [year, setYear] = useState(lastYear);
 147    const [tYear, setTYear] = useState(lastYear);
 148    const [range, setRange] = useState<Range>("Year");
 149    const [hidden, setHidden] = useState<ReadonlySet<Key>>(() => new Set());
 150    const [hover, setHover] = useState<number | null>(null);
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
