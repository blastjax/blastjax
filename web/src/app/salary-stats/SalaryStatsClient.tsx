"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { fmtAmount as fmt } from "@/lib/formatNumber";
import { MONTH_NAMES_FULL as MF, MONTH_NAMES_SHORT as MN } from "@/lib/dateFormat";
import { ERROR_ALERT_CLASSES, LOADING_TEXT_CLASSES } from "@/lib/ui";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@/components/Icons";
import {
  Chip,
  Segmented,
  STATS_CARD_CLASSES,
  STATS_H2_CLASSES,
  STATS_PAGE_CLASSES,
  STATS_SUB_CLASSES,
  STATS_TICK_CLASSES,
  STATS_TIP_CLASSES,
  STATS_XLABEL_CLASSES,
  StatsHeader,
  YearStepper,
  fk,
  niceStep,
  pctOf,
  useWidth,
  xLabels,
} from "@/components/StatsPage";
import { calendarMonthIndex } from "@/app/payslip/payslipAggregates";

const INC = [
  { k: "basic_salary", n: "Basic salary", c: "#10b981" },
  { k: "commission", n: "Commission", c: "#0ea5e9" },
  { k: "thirteenth_month", n: "13th month", c: "#a3e635" },
  { k: "others", n: "Others", c: "#818cf8" },
  { k: "allowances", n: "Allowances", c: "#22d3ee" },
  { k: "reimbursement", n: "Reimbursement", c: "#c084fc" },
  { k: "medical_reimbursement", n: "Medical reimbursement", c: "#5eead4" },
] as const;

const DED = [
  { k: "withholding_tax", n: "Withholding tax", c: "#f43f5e" },
  { k: "mp2", n: "MP2", c: "#fb923c" },
  { k: "philhealth", n: "PhilHealth", c: "#facc15" },
  { k: "sss_contribution", n: "SSS contribution", c: "#f472b6" },
  { k: "pag_ibig", n: "Pag-IBIG", c: "#fca5a5" },
] as const;

type Series = (typeof INC)[number] | (typeof DED)[number];
type Key = Series["k"];
/** One calendar month's totals; `m` is 0-based. */
type Month = { y: number; m: number } & Record<Key, number>;

const ALL: readonly Series[] = [...INC, ...DED];

function blankMonth(t: number): Month {
  const d = { y: Math.floor(t / 12), m: t % 12 } as Month;
  for (const s of ALL) d[s.k] = 0;
  return d;
}

/** Totals per calendar month from the first payslip to the last, gaps zero-filled. */
function buildMonths(rows: PayslipRow[]): Month[] {
  const byT = new Map<number, Month>();
  for (const r of rows) {
    const t = calendarMonthIndex(r);
    if (t == null) continue;
    let d = byT.get(t);
    if (!d) byT.set(t, (d = blankMonth(t)));
    for (const s of ALL) {
      const v = r[s.k];
      if (v != null && Number.isFinite(v)) d[s.k] += v;
    }
  }
  if (byT.size === 0) return [];
  const ts = [...byT.keys()];
  const hi = Math.max(...ts);
  const out: Month[] = [];
  for (let t = Math.min(...ts); t <= hi; t++) out.push(byT.get(t) ?? blankMonth(t));
  return out;
}

const sum = (list: readonly Month[], k: Key) => list.reduce((a, d) => a + d[k], 0);
const gross = (list: readonly Month[]) => INC.reduce((a, s) => a + sum(list, s.k), 0);
const deds = (list: readonly Month[]) => DED.reduce((a, s) => a + sum(list, s.k), 0);

const RANGES = [
  { value: "Year", label: "Year" },
  { value: "12M", label: "12 mo" },
  { value: "24M", label: "24 mo" },
  { value: "36M", label: "36 mo" },
  { value: "All", label: "All" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const DESCRIPTION = "Compare income and deductions across months and years.";

export default function SalaryStatsClient({ company = "Sophos" }: { company?: string }) {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await getPayslips(2000, company);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = useMemo(() => buildMonths(rows), [rows]);

  if (loading || error || data.length === 0) {
    return (
      <div className={STATS_PAGE_CLASSES}>
        <StatsHeader company={company} title="Salary Stats" description={DESCRIPTION} />
        {error ? (
          <div className={ERROR_ALERT_CLASSES} role="alert">{error}</div>
        ) : (
          <p className={LOADING_TEXT_CLASSES}>
            {loading ? "Loading payslips…" : "No payslips yet — add some to see stats here."}
          </p>
        )}
      </div>
    );
  }
  return <SalaryStatsView company={company} data={data} />;
}

function SalaryStatsView({ company, data }: { company: string; data: Month[] }) {
  const yrs = useMemo(() => [...new Set(data.map((d) => d.y))], [data]);
  const firstYear = yrs[0]!;
  const lastYear = yrs[yrs.length - 1]!;

  const [year, setYear] = useState(lastYear);
  const [tYear, setTYear] = useState(lastYear);
  const [range, setRange] = useState<Range>("Year");
  const [hidden, setHidden] = useState<ReadonlySet<Key>>(() => new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [trendRef, W] = useWidth();

  const pickYear = (y: number) => {
    setYear(y);
    setTYear(y);
    setRange("Year");
    setHover(null);
  };

  /* ---- Selected year vs the same months of the year before ---- */
  const yearRows = data.filter((d) => d.y === year);
  const ms = yearRows.map((d) => d.m);
  const prev = data.filter((d) => d.y === year - 1 && ms.includes(d.m));
  const hasPrev = prev.length === yearRows.length && prev.length > 0;
  const partial = yearRows.length < 12;
  const g = gross(yearRows);
  const dd = deds(yearRows);
  const net = g - dd;
  const pg = gross(prev);
  const pd = deds(prev);
  const cmp = !hasPrev
    ? "no prior-year data"
    : partial
      ? `vs ${MN[ms[0]!]}–${MN[ms[ms.length - 1]!]} ${year - 1}`
      : `vs ${year - 1}`;
  const kpi = (label: string, cur: number, pv: number, upGood: boolean) => {
    const d = hasPrev && pv ? ((cur - pv) / pv) * 100 : null;
    return { label, value: fmt(cur), d, good: d == null ? null : d >= 0 === upGood };
  };
  const kpis = [
    kpi("Gross income", g, pg, true),
    kpi("Take-home pay", net, pg - pd, true),
    kpi("Deductions", dd, pd, false),
    kpi("Commission", sum(yearRows, "commission"), sum(prev, "commission"), true),
  ];
  const breakdown = (defs: readonly Series[], tot: number) =>
    defs
      .map((s) => ({ ...s, v: sum(yearRows, s.k) }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v)
      .map((r) => ({ ...r, pct: pctOf(r.v, tot) }));
  const incRows = breakdown(INC, g);
  const dedRows = breakdown(DED, dd);

  /* ---- Month-by-month diverging chart ---- */
  const isYearMode = range === "Year";
  const rr = isYearMode
    ? data.filter((d) => d.y === tYear)
    : data.slice(-({ "12M": 12, "24M": 24, "36M": 36, All: data.length } as const)[range]);
  const vi = INC.filter((s) => !hidden.has(s.k));
  const vd = DED.filter((s) => !hidden.has(s.k));
  const H = 320, pl = 52, pr = 8, pt = 10, pb = 30;
  const iw = W - pl - pr, ih = H - pt - pb;
  const ups = rr.map((d) => vi.reduce((a, s) => a + d[s.k], 0));
  const dns = rr.map((d) => vd.reduce((a, s) => a + d[s.k], 0));
  const mu = Math.max(1, ...ups);
  const md = Math.max(0, ...dns);
  const step = niceStep((mu + md) / 5);
  const top = Math.ceil(mu / step) * step;
  const bot = Math.ceil(md / step) * step;
  const Y = (v: number) => pt + ((top - v) / (top + bot)) * ih;
  const ticks: { y: number; label: string }[] = [];
  for (let v = -bot; v <= top + 0.1; v += step) ticks.push({ y: Y(v), label: fk(v) });
  const band = iw / Math.max(1, rr.length);
  const bw = Math.max(2, band * 0.62);
  const cx = (i: number) => pl + i * band + band / 2;
  const bars: { x: number; y: number; h: number; fill: string; op: number }[] = [];
  rr.forEach((d, i) => {
    const x = pl + i * band + (band - bw) / 2;
    const op = hover == null || hover === i ? 1 : 0.35;
    let a = 0;
    for (const s of vi) {
      const v = d[s.k];
      if (v <= 0) continue;
      bars.push({ x, y: Y(a + v), h: Math.max(0, Y(a) - Y(a + v) - (a > 0 ? 1 : 0)), fill: s.c, op });
      a += v;
    }
    a = 0;
    for (const s of vd) {
      const v = d[s.k];
      if (v <= 0) continue;
      bars.push({ x, y: Y(-a) + (a > 0 ? 1 : 0), h: Math.max(0, Y(-a - v) - Y(-a) - (a > 0 ? 1 : 0)), fill: s.c, op });
      a += v;
    }
  });
  const netPath = rr
    .map((_, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${Y(ups[i]! - dns[i]!).toFixed(1)}`)
    .join(" ");
  const hv = hover != null && hover < rr.length ? hover : null;
  const hd = hv == null ? null : rr[hv]!;
  const hx = hv == null ? 0 : cx(hv);
  const toggle = (k: Key) =>
    setHidden((s) => {
      const n = new Set(s);
      if (!n.delete(k)) n.add(k);
      return n;
    });
  const rFirst = rr[0]!;
  const rLast = rr[rr.length - 1]!;
  const rangeLabel = `${MN[rFirst.m]} ${rFirst.y} – ${MN[rLast.m]} ${rLast.y}`;
  const rg = gross(rr);
  const rd = deds(rr);

  /* ---- All-time ---- */
  const ag = gross(data);
  const ad = deds(data);
  const allTime = (defs: readonly Series[]) => {
    const l = defs.map((s) => ({ ...s, v: sum(data, s.k) })).sort((a, b) => b.v - a.v);
    const mx = l[0]!.v || 1;
    return l.map((r) => ({ ...r, w: pctOf(r.v, mx) }));
  };
  const aFirst = data[0]!;
  const aLast = data[data.length - 1]!;

  return (
    <div className={STATS_PAGE_CLASSES}>
      <StatsHeader company={company} title="Salary Stats" description={DESCRIPTION}>
        <YearStepper
          lg
          year={year}
          sub={partial ? `${MN[ms[0]!]} – ${MN[ms[ms.length - 1]!]}` : "Full year"}
          canPrev={year > firstYear}
          canNext={year < lastYear}
          onPrev={() => pickYear(year - 1)}
          onNext={() => pickYear(year + 1)}
        />
      </StatsHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex flex-col gap-2.5 rounded-[14px] border border-st-line bg-st-card px-5 py-[18px]"
          >
            <div className="text-[13px] text-st-3">{k.label}</div>
            <div className="font-st-mono text-[26px] font-semibold leading-none tracking-[-0.03em] text-st-1">
              {k.value}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-st-4">
              <span
                className={`inline-flex items-center gap-[3px] rounded-full px-[7px] py-0.5 font-medium ${
                  k.good == null
                    ? "bg-st-hover text-st-3"
                    : k.good
                      ? "bg-[rgba(74,222,128,.1)] text-st-pos"
                      : "bg-[rgba(248,113,113,.1)] text-st-down"
                }`}
              >
                {k.d == null ? null : k.d >= 0 ? (
                  <ArrowUpRightIcon className="size-3" />
                ) : (
                  <ArrowDownRightIcon className="size-3" />
                )}
                {k.d == null ? "—" : `${Math.abs(k.d).toFixed(1)}%`}
              </span>
              <span>{cmp}</span>
            </div>
          </div>
        ))}
      </div>

      <section className={STATS_CARD_CLASSES}>
        <div className="mb-[22px]">
          <h2 className={STATS_H2_CLASSES}>Where the money came from, and where it went</h2>
          <p className={STATS_SUB_CLASSES}>Income and deductions for {year}, largest first.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-8">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-[.06em] text-st-4">INCOME</span>
              <span className="font-st-mono text-lg font-semibold text-st-1">{fmt(g)}</span>
            </div>
            <SegmentBar items={incRows} />
            <BreakdownRows items={incRows} amountClass="text-st-1" />
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs tracking-[.06em] text-st-4">
                DEDUCTIONS <span className="text-st-3">· {pctOf(dd, g).toFixed(1)}% of gross</span>
              </span>
              <span className="font-st-mono text-lg font-semibold text-st-neg">{fmt(dd)}</span>
            </div>
            <SegmentBar items={dedRows} />
            <BreakdownRows items={dedRows} amountClass="text-st-neg" />
            <div className="mt-auto flex items-center justify-between rounded-[10px] border border-[rgba(74,222,128,.15)] bg-[rgba(74,222,128,.07)] px-4 py-3.5">
              <span className="text-st-pos-soft">Take-home after deductions</span>
              <span className="font-st-mono text-base font-semibold text-st-pos">{fmt(net)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${STATS_CARD_CLASSES} flex flex-col gap-[18px]`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={STATS_H2_CLASSES}>Month by month</h2>
            <p className={`${STATS_SUB_CLASSES} max-w-[560px] text-pretty`}>
              Income stacks above the line, deductions below. The white line is take-home pay.
              Hover a month for its breakdown.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isYearMode && (
              <YearStepper
                year={tYear}
                canPrev={tYear > firstYear}
                canNext={tYear < lastYear}
                onPrev={() => {
                  setTYear(tYear - 1);
                  setHover(null);
                }}
                onNext={() => {
                  setTYear(tYear + 1);
                  setHover(null);
                }}
              />
            )}
            <Segmented
              options={RANGES}
              value={range}
              onChange={(r) => {
                setRange(r);
                setHover(null);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[rgba(16,185,129,.22)] bg-[rgba(16,185,129,.07)] px-2.5 py-2">
            <span className="mr-1 text-[11px] font-semibold tracking-[.06em] text-st-inc">▲ INCOME</span>
            {INC.map((s) => (
              <Chip key={s.k} label={s.n} color={s.c} on={!hidden.has(s.k)} onClick={() => toggle(s.k)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[rgba(244,63,94,.25)] bg-[rgba(244,63,94,.08)] px-2.5 py-2">
            <span className="mr-1 text-[11px] font-semibold tracking-[.06em] text-st-ded">▼ DEDUCTIONS</span>
            {DED.map((s) => (
              <Chip key={s.k} label={s.n} color={s.c} on={!hidden.has(s.k)} onClick={() => toggle(s.k)} />
            ))}
          </div>
        </div>

        <div ref={trendRef} onMouseLeave={() => setHover(null)} className="relative h-80 w-full">
          {W > 0 && (
            <svg width={W} height={H} className="block overflow-visible">
              <rect x={pl} y={pt} width={iw} height={Math.max(0, Y(0) - pt)} fill="rgba(16,185,129,.05)" />
              <rect x={pl} y={Y(0)} width={iw} height={Math.max(0, pt + ih - Y(0))} fill="rgba(244,63,94,.08)" />
              {ticks.map((k) => (
                <g key={k.y}>
                  <line x1={pl} x2={W - pr} y1={k.y} y2={k.y} className="stroke-st-line" />
                  <text x={pl - 10} y={k.y + 4} textAnchor="end" className={STATS_TICK_CLASSES}>
                    {k.label}
                  </text>
                </g>
              ))}
              <text x={pl + 8} y={pt + 14} className="fill-st-inc text-[10.5px] font-semibold tracking-[.08em]">
                ▲ INCOME
              </text>
              <text x={pl + 8} y={pt + ih - 8} className="fill-st-ded text-[10.5px] font-semibold tracking-[.08em]">
                ▼ DEDUCTIONS
              </text>
              {bars.map((b, i) => (
                <rect key={i} x={b.x} y={b.y} width={bw} height={b.h} fill={b.fill} opacity={b.op} />
              ))}
              <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} className="stroke-st-axis" />
              <path d={netPath} fill="none" strokeWidth={1.75} strokeLinejoin="round" className="stroke-st-1" />
              {xLabels(rr, cx, H - 8).map((x) => (
                <text key={x.x} x={x.x} y={x.y} textAnchor="middle" className={STATS_XLABEL_CLASSES}>
                  {x.label}
                </text>
              ))}
              {hv != null && (
                <circle cx={hx} cy={Y(ups[hv]! - dns[hv]!)} r={4} strokeWidth={2} className="fill-st-bg stroke-st-1" />
              )}
              {rr.map((_, i) => (
                <rect
                  key={i}
                  x={pl + i * band}
                  y={0}
                  width={band}
                  height={H - pb}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              ))}
            </svg>
          )}
          {hd && hv != null && (
            <div className={`${STATS_TIP_CLASSES} w-[230px] gap-[5px]`} style={{ left: Math.max(0, hx + 250 > W ? hx - 244 : hx + 14) }}>
              <div className="mb-1 font-semibold text-st-1">{MF[hd.m]} {hd.y}</div>
              <div className="text-[10.5px] font-semibold tracking-[.08em] text-st-inc">▲ INCOME</div>
              {vi.filter((s) => hd[s.k] > 0).map((s) => (
                <TipRow key={s.k} color={s.c} name={s.n} value={fmt(hd[s.k])} valueClass="text-st-1" />
              ))}
              <div className="mt-1.5 text-[10.5px] font-semibold tracking-[.08em] text-st-ded">▼ DEDUCTIONS</div>
              {vd.filter((s) => hd[s.k] > 0).map((s) => (
                <TipRow key={s.k} color={s.c} name={s.n} value={`−${fmt(hd[s.k])}`} valueClass="text-st-neg" />
              ))}
              <div className="mt-[3px] flex justify-between border-t border-st-line-strong pt-[7px]">
                <span className="text-st-2">Take-home</span>
                <span className="font-st-mono text-[12.5px] font-semibold text-st-pos">{fmt(ups[hv]! - dns[hv]!)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-px overflow-hidden rounded-[10px] border border-st-line bg-st-line">
          {[
            { label: "Gross", v: rg, cls: "text-st-1" },
            { label: "Deductions", v: rd, cls: "text-st-neg" },
            { label: "Take-home", v: rg - rd, cls: "text-st-pos" },
          ].map((c) => (
            <div key={c.label} className="flex flex-col gap-1 bg-st-cell px-4 py-3">
              <span className="text-xs text-st-4">{c.label} · {rangeLabel}</span>
              <span className={`font-st-mono text-base font-semibold ${c.cls}`}>{fmt(c.v)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${STATS_CARD_CLASSES} flex flex-col gap-[22px]`}>
        <div>
          <h2 className={STATS_H2_CLASSES}>All-time summary</h2>
          <p className={STATS_SUB_CLASSES}>
            Totals from {MF[aFirst.m]} {aFirst.y} through {MF[aLast.m]} {aLast.y}.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-st-4">Gross earned</span>
              <span className="font-st-mono text-[22px] font-semibold text-st-1">{fmt(ag)}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-st-4">Take-home</span>
              <span className="font-st-mono text-[30px] font-semibold tracking-[-0.02em] text-st-pos">{fmt(ag - ad)}</span>
            </div>
          </div>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
            <div className="bg-st-pos" style={{ width: `${pctOf(ag - ad, ag)}%` }} />
            <div className="flex-1 bg-st-down" />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[12.5px] text-st-3">
            <span>
              <span className="text-st-pos">■</span> Kept {pctOf(ag - ad, ag).toFixed(1)}%
            </span>
            <span>
              <span className="text-st-down">■</span> Deducted {fmt(ad)} · {pctOf(ad, ag).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-8">
          <AllTimeRows title="INCOME" items={allTime(INC)} amountClass="text-st-1" />
          <AllTimeRows title="DEDUCTIONS" items={allTime(DED)} amountClass="text-st-neg" />
        </div>
      </section>
    </div>
  );
}

function SegmentBar({ items }: { items: readonly { k: string; c: string; pct: number }[] }) {
  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-st-track">
      {items.map((r) => (
        <div key={r.k} style={{ width: `${r.pct}%`, background: r.c }} />
      ))}
    </div>
  );
}

function BreakdownRows({
  items,
  amountClass,
}: {
  items: readonly { k: string; n: string; c: string; v: number; pct: number }[];
  amountClass: string;
}) {
  return (
    <div className="flex flex-col">
      {items.map((r) => (
        <div
          key={r.k}
          className="grid grid-cols-[10px_minmax(0,1fr)_56px_120px] items-center gap-3 border-b border-st-line py-[9px]"
        >
          <span className="size-2.5 rounded-[3px]" style={{ background: r.c }} />
          <span className="text-st-2">{r.n}</span>
          <span className="text-right font-st-mono text-[12.5px] text-st-4">{r.pct.toFixed(1)}%</span>
          <span className={`text-right font-st-mono text-[13.5px] font-medium ${amountClass}`}>{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function AllTimeRows({
  title,
  items,
  amountClass,
}: {
  title: string;
  items: readonly { k: string; n: string; c: string; v: number; w: number }[];
  amountClass: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs tracking-[.06em] text-st-4">{title}</div>
      {items.map((r) => (
        <div
          key={r.k}
          className="grid grid-cols-[minmax(0,1fr)_56px_112px] items-center gap-3.5 border-b border-st-line py-[9px] sm:grid-cols-[minmax(0,1fr)_90px_130px]"
        >
          <span className="text-st-2">{r.n}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-st-track">
            <div className="h-full rounded-full" style={{ width: `${r.w}%`, background: r.c }} />
          </div>
          <span className={`text-right font-st-mono text-[13.5px] font-medium ${amountClass}`}>{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}

function TipRow({
  color,
  name,
  value,
  valueClass,
}: {
  color: string;
  name: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      <span className="flex-1 text-st-3">{name}</span>
      <span className={`font-st-mono ${valueClass}`}>{value}</span>
    </div>
  );
}
