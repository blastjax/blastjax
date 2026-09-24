"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { fmtAmount as fmt } from "@/lib/formatNumber";
import { MONTH_NAMES_FULL as MF, MONTH_NAMES_SHORT as MN } from "@/lib/dateFormat";
import { ERROR_ALERT_CLASSES, LOADING_TEXT_CLASSES } from "@/lib/ui";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/Icons";
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
import { buildForecast, monthlyCommission, type MonthValue } from "./commissionForecast";

/** One line color per year, oldest first; cycles past six years. */
const YEAR_COLORS = ["#60a5fa", "#fb923c", "#2dd4bf", "#fbbf24", "#f472b6", "#4ade80"];

const HORIZONS = [
  { value: 3, label: "3 mo" },
  { value: 6, label: "6 mo" },
  { value: 12, label: "12 mo" },
] as const;
type Horizon = (typeof HORIZONS)[number]["value"];

const RANGES = [
  { value: "Year", label: "Year" },
  { value: "12M", label: "12 mo" },
  { value: "24M", label: "24 mo" },
  { value: "All", label: "All" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const VIEWS = [
  { value: "heat", label: "Heatmap" },
  { value: "lines", label: "Lines" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const DESCRIPTION = "Track commission earned per month and forecast what's still to come.";

const signedPct = (cur: number, base: number) =>
  `${cur >= base ? "+" : "−"}${Math.abs(((cur - base) / base) * 100).toFixed(1)}%`;

export default function CommissionClient({ company = "Sophos" }: { company?: string }) {
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

  const hist = useMemo(() => monthlyCommission(rows), [rows]);

  if (loading || error || hist.length === 0) {
    return (
      <div className={STATS_PAGE_CLASSES}>
        <StatsHeader company={company} title="Commission" description={DESCRIPTION} />
        {error ? (
          <div className={ERROR_ALERT_CLASSES} role="alert">{error}</div>
        ) : (
          <p className={LOADING_TEXT_CLASSES}>
            {loading
              ? "Loading payslips…"
              : "No commission history yet — add payslip entries with a commission amount to see a forecast here."}
          </p>
        )}
      </div>
    );
  }
  return <CommissionView company={company} hist={hist} />;
}

function CommissionView({ company, hist }: { company: string; hist: MonthValue[] }) {
  const last = hist[hist.length - 1]!;
  const [h, setH] = useState<Horizon>(6);
  const [cRange, setCRange] = useState<Range>("Year");
  const [cYear, setCYear] = useState(last.y);
  const [cHover, setCHover] = useState<number | null>(null);
  const [view, setView] = useState<View>("heat");
  const [hiddenYears, setHiddenYears] = useState<ReadonlySet<number>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [chartRef, W] = useWidth();
  const [linesRef, LW] = useWidth();

  const byIndex = useMemo(() => new Map(hist.map((d) => [d.y * 12 + d.m, d.v])), [hist]);
  const cv = (y: number, m: number) => byIndex.get(y * 12 + m) ?? null;
  const fc = useMemo(() => buildForecast(hist, h), [hist, h]);
  const years = [...new Set(hist.map((d) => d.y))];

  /* ---- KPIs ---- */
  const f0 = fc[0]!;
  const fLast = fc[fc.length - 1]!;
  const ly0 = cv(f0.y - 1, f0.m);
  const ytd = hist.filter((d) => d.y === last.y);
  const ytdSum = ytd.reduce((a, d) => a + d.v, 0);
  const lySum = ytd.reduce((a, d) => a + (cv(d.y - 1, d.m) ?? 0), 0);
  const avg = hist.reduce((a, d) => a + d.v, 0) / hist.length;
  const kpis = [
    {
      label: `Next month · ${MF[f0.m]} ${f0.y}`,
      value: fmt(f0.v),
      sub: ly0 != null ? `Predicted · ${MN[f0.m]} ${f0.y - 1} was ${fmt(ly0)}` : "Predicted",
      accent: true,
    },
    {
      label: `Next ${h} months`,
      value: fmt(fc.reduce((a, f) => a + f.v, 0)),
      sub: `Predicted total · ${MN[f0.m]} ${f0.y} – ${MN[fLast.m]} ${fLast.y}`,
    },
    {
      label: `${last.y} so far`,
      value: fmt(ytdSum),
      sub: lySum
        ? `${signedPct(ytdSum, lySum)} vs ${MN[ytd[0]!.m]}–${MN[last.m]} ${last.y - 1}`
        : `No ${last.y - 1} data to compare`,
    },
    { label: "Monthly average", value: fmt(avg), sub: `All-time, across ${hist.length} months` },
  ];

  /* ---- Trend & forecast chart ---- */
  const cYears = [...new Set([...years, ...fc.map((f) => f.y)])];
  const cy = Math.min(cYear, cYears[cYears.length - 1]!);
  const yMode = cRange === "Year";
  const hs = yMode
    ? hist.filter((d) => d.y === cy)
    : hist.slice(-({ "12M": 12, "24M": 24, All: hist.length } as const)[cRange]);
  const fcs = yMode ? fc.filter((f) => f.y === cy) : fc;
  const pts = [...hs.map((d) => ({ ...d, f: false })), ...fcs.map((f) => ({ y: f.y, m: f.m, v: f.v, f: true }))];
  const H = 300, pl = 52, pr = 8, pt = 10, pb = 30;
  const iw = W - pl - pr, ih = H - pt - pb;
  const mx = Math.max(1, ...pts.map((p) => p.v));
  const step = niceStep(mx / 4);
  const top = Math.ceil(mx / step) * step;
  const Y = (v: number) => pt + ((top - v) / top) * ih;
  const sx = iw / Math.max(1, pts.length - 1);
  const X = (i: number) => pl + i * sx;
  const ticks: { y: number; label: string }[] = [];
  for (let v = 0; v <= top + 0.1; v += step) ticks.push({ y: Y(v), label: fk(v) });
  const hn = hs.length;
  const line = hs.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(" ");
  const area = hn ? `${line} L${X(hn - 1).toFixed(1)} ${Y(0)} L${X(0)} ${Y(0)} Z` : "";
  const f0i = Math.max(0, hn - 1);
  const fline = fcs.length
    ? pts.slice(f0i).map((d, i) => `${i ? "L" : "M"}${X(f0i + i).toFixed(1)} ${Y(d.v).toFixed(1)}`).join(" ")
    : "";
  const fx = fcs.length ? X(f0i) : W - pr;
  const hp = cHover != null && cHover < pts.length ? pts[cHover]! : null;
  const hx = cHover == null ? 0 : X(cHover);
  const hpPrev = hp ? cv(hp.y - 1, hp.m) : null;
  const stepYear = (y: number) => {
    setCYear(y);
    setCHover(null);
  };

  /* ---- Heatmap + seasonal lines ---- */
  const hmx = Math.max(1, ...hist.map((d) => d.v));
  const LH = 300, lpl = 52, lpr = 12, lpt = 10, lpb = 30;
  const liw = LW - lpl - lpr, lih = LH - lpt - lpb;
  const lstep = niceStep(hmx / 4);
  const ltop = Math.ceil(hmx / lstep) * lstep;
  const LY = (v: number) => lpt + ((ltop - v) / ltop) * lih;
  const LX = (m: number) => lpl + m * (liw / 11);
  const lticks: { y: number; label: string }[] = [];
  for (let v = 0; v <= ltop + 0.1; v += lstep) lticks.push({ y: LY(v), label: fk(v) });
  const yearColor = (y: number) => YEAR_COLORS[years.indexOf(y) % YEAR_COLORS.length]!;

  return (
    <div className={STATS_PAGE_CLASSES}>
      <StatsHeader company={company} title="Commission" description={DESCRIPTION}>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-st-3">Forecast</span>
          <Segmented
            options={HORIZONS}
            value={h}
            onChange={(v) => {
              setH(v);
              setCHover(null);
            }}
          />
        </div>
      </StatsHeader>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`flex flex-col gap-2.5 rounded-[14px] border px-5 py-[18px] ${
              k.accent ? "border-[rgba(45,212,191,.2)] bg-[rgba(45,212,191,.07)]" : "border-st-line bg-st-card"
            }`}
          >
            <div className={`text-[13px] ${k.accent ? "text-st-teal-soft" : "text-st-3"}`}>{k.label}</div>
            <div
              className={`font-st-mono text-[26px] font-semibold leading-none tracking-[-0.03em] ${
                k.accent ? "text-st-teal" : "text-st-1"
              }`}
            >
              {k.value}
            </div>
            <div className="text-xs text-st-4">{k.sub}</div>
          </div>
        ))}
      </div>

      <section className={`${STATS_CARD_CLASSES} flex flex-col gap-[18px]`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={STATS_H2_CLASSES}>Trend &amp; forecast</h2>
            <p className={`${STATS_SUB_CLASSES} max-w-[600px] text-pretty`}>
              Actual commission per month (solid) and the projection (dashed). Each forecast month
              is trended from the same calendar month in prior years, since commission is seasonal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {yMode && (
              <YearStepper
                year={cy}
                canPrev={cy > cYears[0]!}
                canNext={cy < cYears[cYears.length - 1]!}
                onPrev={() => stepYear(cy - 1)}
                onNext={() => stepYear(cy + 1)}
              />
            )}
            <Segmented
              options={RANGES}
              value={cRange}
              onChange={(r) => {
                setCRange(r);
                setCHover(null);
              }}
            />
          </div>
        </div>
        <div ref={chartRef} onMouseLeave={() => setCHover(null)} className="relative h-[300px] w-full">
          {W > 0 && (
            <svg width={W} height={H} className="block overflow-visible">
              <defs>
                <linearGradient id="commission-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: "var(--st-teal-strong)", stopOpacity: 0.28 }} />
                  <stop offset="1" style={{ stopColor: "var(--st-teal-strong)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <rect x={fx} y={pt} width={Math.max(0, W - pr - fx)} height={ih} fill="rgba(45,212,191,.05)" />
              {fcs.length > 0 && (
                <text x={fx + 8} y={pt + 14} className="fill-st-teal text-[11px] font-medium">Forecast</text>
              )}
              {ticks.map((k) => (
                <g key={k.y}>
                  <line x1={pl} x2={W - pr} y1={k.y} y2={k.y} className="stroke-st-line" />
                  <text x={pl - 10} y={k.y + 4} textAnchor="end" className={STATS_TICK_CLASSES}>
                    {k.label}
                  </text>
                </g>
              ))}
              <path d={area} fill="url(#commission-area)" />
              <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-st-teal-strong" />
              <path d={fline} fill="none" strokeWidth={2} strokeDasharray="5 5" className="stroke-st-teal" />
              {fcs.map((f, i) => (
                <circle key={i} cx={X(hn + i)} cy={Y(f.v)} r={3.5} strokeWidth={1.5} className="fill-st-card stroke-st-teal" />
              ))}
              {xLabels(pts, X, H - 8).map((x) => (
                <text key={x.x} x={x.x} y={x.y} textAnchor="middle" className={STATS_XLABEL_CLASSES}>
                  {x.label}
                </text>
              ))}
              {hp && (
                <>
                  <line x1={hx} x2={hx} y1={pt} y2={H - pb} className="stroke-st-5" />
                  <circle cx={hx} cy={Y(hp.v)} r={5} strokeWidth={2} className="fill-st-teal-strong stroke-st-bg" />
                </>
              )}
              {pts.map((_, i) => (
                <rect
                  key={i}
                  x={X(i) - sx / 2}
                  y={0}
                  width={sx}
                  height={H - pb}
                  fill="transparent"
                  onMouseEnter={() => setCHover(i)}
                />
              ))}
            </svg>
          )}
          {hp && (
            <div className={`${STATS_TIP_CLASSES} w-[200px] gap-1.5`} style={{ left: Math.max(0, hx + 220 > W ? hx - 214 : hx + 14) }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-st-1">{MF[hp.m]} {hp.y}</span>
                <span className="rounded bg-[rgba(45,212,191,.12)] px-1.5 py-0.5 text-[10.5px] text-st-teal">
                  {hp.f ? "Forecast" : "Actual"}
                </span>
              </div>
              <div className="font-st-mono text-lg font-semibold text-st-1">{fmt(hp.v)}</div>
              <div className="text-st-3">
                {hpPrev ? `${signedPct(hp.v, hpPrev)} vs ${MN[hp.m]} ${hp.y - 1}` : "No data for last year"}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={`${STATS_CARD_CLASSES} flex flex-col gap-4`}>
        <div>
          <h2 className={STATS_H2_CLASSES}>Forecast breakdown</h2>
          <p className={STATS_SUB_CLASSES}>
            Each month is projected from up to 5 previous years of the same month. Open a row to see
            the inputs.
          </p>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-[720px] flex-col">
            <div className="grid grid-cols-[minmax(140px,1.2fr)_130px_150px_150px_110px_32px] gap-4 border-b border-st-line px-3 pb-2.5 text-[11px] tracking-[.06em] text-st-4">
              <span>MONTH</span>
              <span className="text-right">PREDICTED</span>
              <span className="text-right">VS LAST YEAR</span>
              <span>HISTORY</span>
              <span className="text-right">TREND / YR</span>
              <span />
            </div>
            {fc.map((f, i) => {
              const lyv = cv(f.y - 1, f.m);
              const d = lyv ? ((f.v - lyv) / lyv) * 100 : null;
              const n = f.pts.length;
              const vals = [...f.pts.map((p) => p[1]), f.v];
              const lo = Math.min(...vals);
              const hi = Math.max(...vals);
              const mxp = (j: number) => 4 + j * (142 / Math.max(1, n));
              const myp = (v: number) => 30 - (hi === lo ? 13 : ((v - lo) / (hi - lo)) * 26);
              const dots = f.pts.map((p, j) => ({ x: mxp(j), y: myp(p[1]) }));
              const lp = dots[dots.length - 1];
              const open = expanded.has(i);
              const pm = hi || 1;
              return (
                <div key={`${f.y}-${f.m}`} className="border-b border-st-line">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (!next.delete(i)) next.add(i);
                        return next;
                      })
                    }
                    className="grid w-full grid-cols-[minmax(140px,1.2fr)_130px_150px_150px_110px_32px] items-center gap-4 rounded-lg p-3 text-left hover:bg-st-hover"
                  >
                    <span className="font-medium text-st-1">{MF[f.m]} {f.y}</span>
                    <span className="text-right font-st-mono text-sm font-semibold text-st-teal">{fmt(f.v)}</span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className={`font-st-mono text-[12.5px] ${d == null ? "text-st-4" : d >= 0 ? "text-st-pos" : "text-st-down"}`}>
                        {d == null ? "—" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`}
                      </span>
                      <span className="whitespace-nowrap text-[11.5px] text-st-4">
                        {lyv != null ? `${MN[f.m]} ${f.y - 1}: ${fmt(lyv)}` : ""}
                      </span>
                    </span>
                    <svg width={150} height={34} className="block overflow-visible">
                      <path
                        d={dots.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
                        fill="none"
                        strokeWidth={1.5}
                        className="stroke-st-4"
                      />
                      {lp && (
                        <path
                          d={`M${lp.x.toFixed(1)} ${lp.y.toFixed(1)} L${mxp(n).toFixed(1)} ${myp(f.v).toFixed(1)}`}
                          fill="none"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          className="stroke-st-teal"
                        />
                      )}
                      {dots.map((p, j) => (
                        <circle key={j} cx={p.x} cy={p.y} r={2.5} className="fill-st-3" />
                      ))}
                      <circle cx={mxp(n)} cy={myp(f.v)} r={3.5} strokeWidth={1.5} className="fill-st-card stroke-st-teal" />
                    </svg>
                    <span className={`text-right font-st-mono text-[12.5px] ${f.slope >= 0 ? "text-st-pos" : "text-st-down"}`}>
                      {f.slope >= 0 ? "+" : "−"}
                      {fmt(Math.abs(f.slope))}
                    </span>
                    {open ? (
                      <ChevronUpIcon className="size-4 justify-self-end text-st-4" />
                    ) : (
                      <ChevronDownIcon className="size-4 justify-self-end text-st-4" />
                    )}
                  </button>
                  {open && (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6 px-3 pb-[18px] pt-1">
                      <div className="flex flex-col gap-1.5">
                        {[
                          ...f.pts.map(([py, pv]) => ({ label: `${MN[f.m]} ${py}`, v: pv, forecast: false })),
                          { label: `${MN[f.m]} ${f.y}`, v: f.v, forecast: true },
                        ].map((p) => (
                          <div key={p.label} className="grid grid-cols-[72px_minmax(0,1fr)_96px] items-center gap-2.5 text-[12.5px]">
                            <span className="text-st-3">{p.label}</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-st-track">
                              <div
                                className={`h-full rounded-full ${p.forecast ? "bg-st-teal-strong" : "bg-st-6"}`}
                                style={{ width: `${pctOf(p.v, pm)}%` }}
                              />
                            </div>
                            <span className={`text-right font-st-mono ${p.forecast ? "text-st-teal" : "text-st-2"}`}>
                              {fmt(p.v)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="self-center text-pretty text-[13px] leading-[1.6] text-st-3">
                        {n >= 2
                          ? `A straight-line trend was fitted to ${MF[f.m]} across ${n} years (${f.pts[0]![0]}–${f.pts[n - 1]![0]}). It moves ${f.slope >= 0 ? "up" : "down"} ${fmt(Math.abs(f.slope))} per year, which projects ${fmt(f.v)} for ${f.y}.`
                          : n === 1
                            ? `Only ${f.pts[0]![0]} has ${MF[f.m]} data, so its value is carried forward: ${fmt(f.v)} for ${f.y}.`
                            : `No earlier ${MF[f.m]} to trend from, so this uses the all-time monthly average: ${fmt(f.v)}.`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${STATS_CARD_CLASSES} flex flex-col gap-[18px]`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className={STATS_H2_CLASSES}>History by month</h2>
            <p className={`${STATS_SUB_CLASSES} max-w-[600px] text-pretty`}>
              One row per year, one column per calendar month. Brighter cells mean higher commission,
              so seasonal peaks line up vertically.
            </p>
          </div>
          <Segmented options={VIEWS} value={view} onChange={setView} />
        </div>

        {view === "heat" ? (
          <div className="overflow-x-auto font-st-mono text-xs font-medium text-st-1">
            <div className="grid min-w-[820px] grid-cols-[52px_repeat(12,minmax(0,1fr))_104px] items-center gap-1">
              <span />
              {MN.map((m) => (
                <span key={m} className="pb-1 text-center">{m}</span>
              ))}
              <span className="pb-1 text-right">Total</span>
              {[...years].reverse().map((y) => {
                const inYear = hist.filter((d) => d.y === y);
                const note =
                  inYear.length === 12
                    ? ""
                    : y === last.y
                      ? "Year to date"
                      : `${MN[inYear[0]!.m]} – ${MN[inYear[inYear.length - 1]!.m]}`;
                return (
                  <HeatRow
                    key={y}
                    year={y}
                    note={note}
                    total={inYear.reduce((a, d) => a + d.v, 0)}
                    cells={MN.map((_, m) => {
                      const v = cv(y, m);
                      const f = v == null ? fc.find((x) => x.y === y && x.m === m) : undefined;
                      return { m, v, f: f?.v ?? null };
                    })}
                    max={hmx}
                  />
                );
              })}
              <span className="pt-1.5">Avg</span>
              {MN.map((mn, m) => {
                const vs = years.map((y) => cv(y, m)).filter((v): v is number => v != null);
                return (
                  <span key={mn} className="pt-1.5 text-center">
                    {vs.length ? fk(vs.reduce((a, b) => a + b, 0) / vs.length) : "—"}
                  </span>
                );
              })}
              <span />
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-3.5">
              <span className="flex items-center gap-1.5">
                Low
                <span className="h-2 w-[120px] rounded-full bg-[linear-gradient(90deg,rgba(45,212,191,.1),rgba(45,212,191,.85))]" />
                High
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-4 rounded-[3px] border border-dashed border-[#2dd4bf]" />
                Forecast
              </span>
            </div>
          </div>
        ) : (
          <>
            <div ref={linesRef} className="h-80 w-full">
              {LW > 0 && (
                <svg width={LW} height={LH} className="block overflow-visible">
                  {lticks.map((k) => (
                    <g key={k.y}>
                      <line x1={lpl} x2={LW - lpr} y1={k.y} y2={k.y} className="stroke-st-line" />
                      <text x={lpl - 10} y={k.y + 4} textAnchor="end" className={STATS_TICK_CLASSES}>
                        {k.label}
                      </text>
                    </g>
                  ))}
                  {years.map((y) => {
                    if (hiddenYears.has(y)) return null;
                    const latest = y === last.y;
                    const inYear = hist.filter((d) => d.y === y);
                    return (
                      <g key={y}>
                        <path
                          d={inYear.map((d, i) => `${i ? "L" : "M"}${LX(d.m).toFixed(1)} ${LY(d.v).toFixed(1)}`).join(" ")}
                          fill="none"
                          stroke={yearColor(y)}
                          strokeWidth={latest ? 2.75 : 1.75}
                          opacity={latest ? 1 : 0.75}
                          strokeLinejoin="round"
                        />
                        {inYear.map((d) => (
                          <circle key={d.m} cx={LX(d.m)} cy={LY(d.v)} r={3} fill={yearColor(y)} opacity={latest ? 1 : 0.8} />
                        ))}
                      </g>
                    );
                  })}
                  {MN.map((mn, m) => (
                    <text key={mn} x={LX(m)} y={LH - 8} textAnchor="middle" className={STATS_XLABEL_CLASSES}>
                      {mn}
                    </text>
                  ))}
                </svg>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {years.map((y) => (
                <Chip
                  key={y}
                  round
                  label={String(y)}
                  color={yearColor(y)}
                  on={!hiddenYears.has(y)}
                  onClick={() =>
                    setHiddenYears((s) => {
                      const next = new Set(s);
                      if (!next.delete(y)) next.add(y);
                      return next;
                    })
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function HeatRow({
  year,
  note,
  total,
  cells,
  max,
}: {
  year: number;
  note: string;
  total: number;
  cells: { m: number; v: number | null; f: number | null }[];
  max: number;
}) {
  const cell = "grid h-[42px] place-items-center rounded-[7px] border";
  return (
    <>
      <span>{year}</span>
      {cells.map(({ m, v, f }) => {
        if (v != null) {
          const a = 0.08 + 0.77 * (v / max);
          return (
            <div
              key={m}
              title={`${MF[m]} ${year}: ${fmt(v)}`}
              className={`${cell} border-transparent`}
              style={{ background: `rgba(45,212,191,${a.toFixed(3)})` }}
            >
              {fk(v)}
            </div>
          );
        }
        if (f != null) {
          return (
            <div
              key={m}
              title={`${MF[m]} ${year} forecast: ${fmt(f)}`}
              className={`${cell} border-dashed border-[rgba(45,212,191,.6)] italic text-st-teal`}
            >
              {fk(f)}
            </div>
          );
        }
        return (
          <div key={m} className={`${cell} border-transparent bg-st-empty`}>
            —
          </div>
        );
      })}
      <div className="flex flex-col items-end leading-[1.2]">
        <span>{fmt(total)}</span>
        <span>{note}</span>
      </div>
    </>
  );
}
