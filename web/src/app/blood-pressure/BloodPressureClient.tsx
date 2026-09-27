"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartZoomControls } from "@/components/ChartZoomControls";
import { PencilIcon, TrashIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { useTheme } from "@/components/ThemeProvider";
import {
  createBloodPressure,
  deleteBloodPressure,
  getBloodPressures,
  updateBloodPressure,
  type BloodPressureCreateBody,
  type BloodPressureRow,
} from "@/lib/api";
import { chartScrollMinWidth, xAxisTickInterval } from "@/lib/chartAxis";
import { getChartTooltipStyle } from "@/lib/chartTooltipStyle";
import { formatDateTime, formatMonthDayShort } from "@/lib/dateFormat";
import {
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  ICON_BUTTON_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
  TABLE_WRAPPER_CLASSES,
} from "@/lib/ui";
import { useChartZoom } from "@/lib/useChartZoom";

type Field = "systolic" | "diastolic" | "pulse" | "spo2" | "temperature" | "weight";

/**
 * Normal resting ranges, inclusive: BP under 120/80 but not hypotensive,
 * resting pulse 60–100, SpO2 at least 95%. This one table drives the red
 * values, the Normal / Out of range verdict, and the chart's shaded band.
 */
const NORMAL: Partial<Record<Field, readonly [number, number]>> = {
  systolic: [90, 119],
  diastolic: [60, 79],
  pulse: [60, 100],
  spo2: [95, 100],
};

function outOfRange(field: Field, v: number | null): boolean {
  const band = NORMAL[field];
  return v != null && band != null && (v < band[0] || v > band[1]);
}

/** Judged only when BP + pulse were taken; a weight-only reading gets null. */
function verdict(r: BloodPressureRow): boolean | null {
  if (r.systolic == null || r.diastolic == null || r.pulse == null) return null;
  return !(Object.keys(NORMAL) as Field[]).some((f) => outOfRange(f, r[f]));
}

type Metric = {
  tab: string;
  label: string;
  unit: string;
  digits: number;
  lines: { key: Field; name: string; color: string }[];
};

/** One chart per metric, so each y-axis fits its own scale (36.5 °C next to 120 mmHg is a flat line). */
const METRICS: Metric[] = [
  {
    tab: "BP",
    label: "Blood pressure",
    unit: "mmHg",
    digits: 0,
    lines: [
      { key: "systolic", name: "Systolic", color: "#ef4444" },
      { key: "diastolic", name: "Diastolic", color: "#6366f1" },
    ],
  },
  { tab: "Pulse", label: "Pulse", unit: "bpm", digits: 0, lines: [{ key: "pulse", name: "Pulse", color: "#10b981" }] },
  { tab: "SpO2", label: "SpO2", unit: "%", digits: 0, lines: [{ key: "spo2", name: "SpO2", color: "#0ea5e9" }] },
  { tab: "Temp", label: "Temperature", unit: "°C", digits: 1, lines: [{ key: "temperature", name: "Temperature", color: "#f97316" }] },
  { tab: "Weight", label: "Weight", unit: "kg", digits: 1, lines: [{ key: "weight", name: "Weight", color: "#a855f7" }] },
];

const fmt = (v: number | null, digits: number) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

/** "118/76" for BP, "36.6" for temperature; null when the reading skipped it. */
function metricValue(m: Metric, r: BloodPressureRow): string | null {
  if (r[m.lines[0].key] == null) return null;
  return m.lines.map((l) => fmt(r[l.key], m.digits)).join("/");
}

function metricOut(m: Metric, r: BloodPressureRow): boolean {
  return m.lines.some((l) => outOfRange(l.key, r[l.key]));
}

type FormField = {
  key: Field;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  placeholder: string;
};

// Native min/max/step do the range and whole-number checks; the API re-validates.
const BP_FIELDS: FormField[] = [
  { key: "systolic", label: "Systolic", unit: "mmHg", min: 1, max: 400, placeholder: "120" },
  { key: "diastolic", label: "Diastolic", unit: "mmHg", min: 1, max: 400, placeholder: "80" },
  { key: "pulse", label: "Pulse", unit: "bpm", min: 1, max: 400, placeholder: "72" },
];
const OTHER_FIELDS: FormField[] = [
  { key: "spo2", label: "SpO2", unit: "%", min: 1, max: 100, placeholder: "98" },
  { key: "temperature", label: "Temp", unit: "°C", min: 26, max: 45, step: 0.1, placeholder: "36.6" },
  { key: "weight", label: "Weight", unit: "kg", min: 0.1, max: 500, step: 0.1, placeholder: "70.0" },
];

const emptyForm: Record<Field | "notes", string> = {
  systolic: "",
  diastolic: "",
  pulse: "",
  spo2: "",
  temperature: "",
  weight: "",
  notes: "",
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (v: number | null) => (v == null ? "" : String(v));

const PILL = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";

export default function BloodPressureClient() {
  const [rows, setRows] = useState<BloodPressureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [metricIdx, setMetricIdx] = useState(0);

  const { theme } = useTheme();
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";
  const tooltipStyle = useMemo(() => getChartTooltipStyle(theme), [theme]);
  const zoom = useChartZoom();

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getBloodPressures(2000);
      setRows(r.readings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load readings");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Oldest → newest: the chart reads left to right and "latest" is the tail.
  const byDate = useMemo(
    () => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows],
  );
  const newestFirst = useMemo(() => [...byDate].reverse(), [byDate]);

  const tiles = useMemo(
    () =>
      METRICS.map((m) => {
        const logged = byDate.filter((r) => r[m.lines[0].key] != null);
        const avg = m.lines
          .map((l) => fmt(logged.reduce((s, r) => s + (r[l.key] ?? 0), 0) / logged.length, m.digits))
          .join("/");
        return { m, latest: logged[logged.length - 1], avg };
      }),
    [byDate],
  );

  const judged = useMemo(() => rows.map(verdict).filter((v) => v != null), [rows]);
  const normalCount = judged.filter(Boolean).length;

  const metric = METRICS[metricIdx];
  const points = useMemo(
    () => byDate.filter((r) => r[metric.lines[0].key] != null),
    [byDate, metric],
  );

  const bpStarted = [form.systolic, form.diastolic, form.pulse].some((v) => v.trim() !== "");

  const openAdd = () => {
    setError(null);
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (r: BloodPressureRow) => {
    setError(null);
    setEditingId(r.id);
    setForm({
      systolic: str(r.systolic),
      diastolic: str(r.diastolic),
      pulse: str(r.pulse),
      spo2: str(r.spo2),
      temperature: str(r.temperature),
      weight: str(r.weight),
      notes: r.notes ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: BloodPressureCreateBody = {
      systolic: num(form.systolic),
      diastolic: num(form.diastolic),
      pulse: num(form.pulse),
      spo2: num(form.spo2),
      temperature: num(form.temperature),
      weight: num(form.weight),
      notes: form.notes.trim() || null,
    };
    if (Object.values(body).every((v) => v == null)) {
      setError("Fill in at least one field.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fresh =
        editingId != null
          ? await updateBloodPressure(editingId, body)
          : await createBloodPressure(body);
      setRows((rs) => {
        const i = rs.findIndex((x) => x.id === fresh.reading.id);
        if (i === -1) return [fresh.reading, ...rs];
        const out = rs.slice();
        out[i] = fresh.reading;
        return out;
      });
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this reading?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBloodPressure(id);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: FormField) => (
    <label key={f.key} className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">
        {f.label} <span className="font-normal text-ink-4">{f.unit}</span>
      </span>
      <input
        type="number"
        inputMode={f.step ? "decimal" : "numeric"}
        min={f.min}
        max={f.max}
        step={f.step}
        placeholder={f.placeholder}
        // All three BP fields become required as soon as one is started.
        required={bpStarted && BP_FIELDS.includes(f)}
        autoFocus={f.key === "systolic"}
        // Hide the native spinner arrows (WebKit pseudo-elements + Firefox textfield).
        className={`${INPUT_CLASSES} w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        value={form[f.key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
        disabled={saving}
      />
    </label>
  );

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Health"
        description="Blood pressure, pulse, SpO2, temperature, and weight over time."
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={openAdd}>
            + Add reading
          </button>
        }
      />

      {error && !modalOpen && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading readings…</p>
      ) : rows.length === 0 ? (
        !error && (
          <p className={DASHED_EMPTY_CLASSES}>
            No readings yet. Use <span className="font-medium text-ink-2">Add reading</span> to log
            your first one.
          </p>
        )
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-6">
            {tiles.map(({ m, latest, avg }, i) => (
              // Wrapper is a grid so the card stretches; BP gets the full row on phones.
              <div key={m.tab} className={i === 0 ? "col-span-2 grid sm:col-span-1" : "grid"}>
                <StatCard
                  label={m.label}
                  value={
                    latest ? (
                      <span className={metricOut(m, latest) ? "text-danger-text" : undefined}>
                        {metricValue(m, latest)}
                        <span className="ml-1 text-sm font-medium text-ink-3">{m.unit}</span>
                      </span>
                    ) : (
                      "—"
                    )
                  }
                  footer={
                    latest
                      ? `${formatMonthDayShort(latest.created_at)} · avg ${avg}`
                      : "Nothing logged yet"
                  }
                />
              </div>
            ))}
            <div className="col-span-2 grid sm:col-span-1">
              <StatCard
                label="In normal range"
                value={
                  judged.length > 0 ? `${Math.round((normalCount / judged.length) * 100)}%` : "—"
                }
                footer={`${normalCount} of ${judged.length} BP readings`}
              />
            </div>
          </section>

          <section className={CARD_CLASSES}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">{metric.label} trend</h2>
                <p className="mt-1 text-sm text-ink-3">
                  {metric.lines.some((l) => NORMAL[l.key])
                    ? "The shaded band is the normal range."
                    : "Oldest to newest."}
                </p>
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-3">
                <div className={`${SEGMENTED_WRAPPER_CLASSES} max-w-full overflow-x-auto`}>
                  {METRICS.map((m, i) => (
                    <button
                      key={m.tab}
                      type="button"
                      aria-pressed={i === metricIdx}
                      className={`${SEGMENTED_BUTTON_CLASSES} ${
                        i === metricIdx
                          ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                          : SEGMENTED_BUTTON_INACTIVE_CLASSES
                      }`}
                      onClick={() => setMetricIdx(i)}
                    >
                      {m.tab}
                    </button>
                  ))}
                </div>
                <ChartZoomControls
                  zoom={zoom.zoom}
                  onZoomIn={zoom.zoomIn}
                  onZoomOut={zoom.zoomOut}
                  onReset={zoom.resetZoom}
                  canZoomIn={zoom.canZoomIn}
                  canZoomOut={zoom.canZoomOut}
                />
              </div>
            </div>
            <div className="mt-5 h-[min(22rem,55vh)] min-h-[240px] w-full">
              {points.length === 0 ? (
                <p className={DASHED_EMPTY_CLASSES}>Nothing logged for {metric.label} yet.</p>
              ) : (
                <div className="h-full w-full overflow-x-auto">
                  <div
                    className="h-full"
                    style={{ minWidth: chartScrollMinWidth(points.length, 56 * zoom.zoom) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-line" />
                        <XAxis
                          dataKey="created_at"
                          tickFormatter={formatMonthDayShort}
                          interval={xAxisTickInterval(points.length, 48)}
                          tick={{ fontSize: 11, fill: axisTickFill }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={["auto", "auto"]}
                          width={40}
                          tick={{ fontSize: 11, fill: axisTickFill }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={(v) => formatDateTime(String(v))}
                          formatter={(v) => `${v} ${metric.unit}`}
                        />
                        {metric.lines.length > 1 && <Legend />}
                        {metric.lines.map((l) => {
                          const band = NORMAL[l.key];
                          return band ? (
                            <ReferenceArea
                              key={`band-${l.key}`}
                              y1={band[0]}
                              y2={band[1]}
                              fill={l.color}
                              fillOpacity={0.08}
                              ifOverflow="extendDomain"
                            />
                          ) : null;
                        })}
                        {metric.lines.map((l) => (
                          <Line
                            key={l.key}
                            type="monotone"
                            dataKey={l.key}
                            name={l.name}
                            stroke={l.color}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">History</h2>
            <div className={`${TABLE_WRAPPER_CLASSES} overflow-x-auto`}>
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASSES}>
                    <th className={TABLE_HEAD_CELL_CLASSES}>Date</th>
                    {METRICS.map((m) => (
                      <th key={m.tab} className={TABLE_HEAD_CELL_CLASSES}>
                        {m.tab} <span className="normal-case">({m.unit})</span>
                      </th>
                    ))}
                    <th className={TABLE_HEAD_CELL_CLASSES}>Status</th>
                    <th className={TABLE_HEAD_CELL_CLASSES}>Notes</th>
                    <th className={TABLE_HEAD_CELL_CLASSES}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((r) => {
                    const v = verdict(r);
                    return (
                      <tr key={r.id} className={TABLE_ROW_CLASSES}>
                        <td className={`${TABLE_CELL_CLASSES} whitespace-nowrap`}>
                          {formatDateTime(r.created_at)}
                        </td>
                        {METRICS.map((m) => (
                          <td key={m.tab} className={TABLE_CELL_CLASSES}>
                            <span className={metricOut(m, r) ? "font-semibold text-danger-text" : undefined}>
                              {metricValue(m, r) ?? "—"}
                            </span>
                          </td>
                        ))}
                        <td className={TABLE_CELL_CLASSES}>
                          {v != null && (
                            <span
                              className={`${PILL} ${
                                v ? "bg-success-soft text-success-text" : "bg-danger-soft text-danger-text"
                              }`}
                            >
                              {v ? "Normal" : "Out of range"}
                            </span>
                          )}
                        </td>
                        <td className={TABLE_CELL_CLASSES}>
                          <p className="max-w-64 truncate" title={r.notes ?? undefined}>
                            {r.notes}
                          </p>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              aria-label="Edit reading"
                              title="Edit"
                              className={ICON_BUTTON_CLASSES}
                              onClick={() => openEdit(r)}
                            >
                              <PencilIcon className="size-5" />
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              aria-label="Delete reading"
                              title="Delete"
                              className={ICON_BUTTON_CLASSES}
                              onClick={() => void onDelete(r.id)}
                            >
                              <TrashIcon className="size-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Modal open={modalOpen} onClose={closeModal} ariaLabelledBy="bp-form-title">
        <h2 id="bp-form-title" className="text-lg font-semibold text-ink">
          {editingId != null ? "Edit reading" : "Add reading"}
        </h2>
        <p className="mt-1 text-sm text-ink-3">Log whatever you measured — every group is optional.</p>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
          {error && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {error}
            </div>
          )}
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className={`${SECTION_LABEL_CLASSES} mb-2`}>
              Blood pressure · all three or none
            </legend>
            {BP_FIELDS.map(renderField)}
          </fieldset>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className={`${SECTION_LABEL_CLASSES} mb-2`}>Other vitals</legend>
            {OTHER_FIELDS.map(renderField)}
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink-2">Notes</span>
            <input
              type="text"
              placeholder="After coffee, left arm…"
              className={INPUT_CLASSES}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={saving}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : editingId != null ? "Save changes" : "Add reading"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
