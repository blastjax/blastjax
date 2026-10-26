"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
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
import {
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  EmptyState,
  Field,
  IconAction,
  LoadingBlocks,
  Metric,
  ModalHeader,
  Panel,
  Pill,
  Segmented,
  StatStrip,
} from "@/components/FinanceUI";
import { HeartPulseIcon, PlusIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
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
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  DASHED_EMPTY_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
} from "@/lib/ui";
import { useChartZoom } from "@/lib/useChartZoom";

type Field = "systolic" | "diastolic" | "pulse" | "spo2" | "temperature" | "weight";

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

function verdict(r: BloodPressureRow): boolean | null {
  if (r.systolic == null || r.diastolic == null || r.pulse == null) return null;
  return !(Object.keys(NORMAL) as Field[]).some((f) => outOfRange(f, r[f]));
}

type ChartMetric = {
  tab: string;
  label: string;
  unit: string;
  digits: number;
  lines: { key: Field; name: string; color: string }[];
};

const METRICS: ChartMetric[] = [
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

function metricValue(m: ChartMetric, r: BloodPressureRow): string | null {
  if (r[m.lines[0].key] == null) return null;
  return m.lines.map((l) => fmt(r[l.key], m.digits)).join("/");
}

function metricOut(m: ChartMetric, r: BloodPressureRow): boolean {
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

const METRIC_OPTIONS = METRICS.map((m, i) => ({ value: i, label: m.tab }));

export default function BloodPressureClient() {
  const [rows, setRows] = useState<BloodPressureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const onDelete = async (id: string) => {
    if (!(await confirmDialog("Delete this reading?"))) return;
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
    <Field
      key={f.key}
      label={
        <>
          {f.label} <span className="font-normal text-ink-4">{f.unit}</span>
        </>
      }
    >
      <input
        type="number"
        inputMode={f.step ? "decimal" : "numeric"}
        min={f.min}
        max={f.max}
        step={f.step}
        placeholder={f.placeholder}
        required={bpStarted && BP_FIELDS.includes(f)}
        autoFocus={f.key === "systolic"}
        className={`${INPUT_CLASSES} w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        value={form[f.key]}
        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
        disabled={saving}
      />
    </Field>
  );

  const addButton = (
    <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={openAdd}>
      <PlusIcon className="size-4" />
      Add reading
    </button>
  );

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Health"
        description="Blood pressure, pulse, SpO2, temperature, and weight over time."
        actions={addButton}
      />

      {error && !modalOpen && (
        <ErrorAlert>
          {error}
        </ErrorAlert>
      )}

      {loading ? (
        <LoadingBlocks label="Loading readings…" />
      ) : rows.length === 0 ? (
        !error && (
          <EmptyState icon={<HeartPulseIcon className="size-6" />} title="No readings yet" action={addButton}>
            Log your blood pressure, pulse, SpO2, temperature or weight to see how they trend over time.
          </EmptyState>
        )
      ) : (
        <>
          <StatStrip className="grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6">
            {tiles.map(({ m, latest, avg }) => (
              <Metric
                key={m.tab}
                label={m.label}
                tone={latest && metricOut(m, latest) ? "danger" : "neutral"}
                value={
                  latest ? (
                    <>
                      {metricValue(m, latest)}
                      <span className="ml-1 text-sm font-medium text-ink-3">{m.unit}</span>
                    </>
                  ) : (
                    "—"
                  )
                }
                hint={latest ? `${formatMonthDayShort(latest.created_at)} · avg ${avg}` : "Nothing logged yet"}
              />
            ))}
            <Metric
              label="In normal range"
              value={judged.length > 0 ? `${Math.round((normalCount / judged.length) * 100)}%` : "—"}
              hint={`${normalCount} of ${judged.length} BP readings`}
            />
          </StatStrip>

          <Panel
            title={`${metric.label} trend`}
            subtitle={
              metric.lines.some((l) => NORMAL[l.key]) ? "The shaded band is the normal range." : "Oldest to newest."
            }
            actions={
              <>
                <Segmented
                  label="Measurement"
                  options={METRIC_OPTIONS}
                  value={metricIdx}
                  onChange={setMetricIdx}
                  className="max-w-full flex-wrap"
                />
                <ChartZoomControls
                  zoom={zoom.zoom}
                  onZoomIn={zoom.zoomIn}
                  onZoomOut={zoom.zoomOut}
                  onReset={zoom.resetZoom}
                  canZoomIn={zoom.canZoomIn}
                  canZoomOut={zoom.canZoomOut}
                />
              </>
            }
          >
            <div className="h-[min(22rem,55vh)] min-h-[240px] w-full">
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
          </Panel>

          <Panel title="History" flush className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASSES}>
                    <th className={`${TABLE_HEAD_CELL_CLASSES} text-left`}>Date</th>
                    {METRICS.map((m) => (
                      <th key={m.tab} className={`${TABLE_HEAD_CELL_CLASSES} text-left`}>
                        {m.tab} ({m.unit})
                      </th>
                    ))}
                    <th className={`${TABLE_HEAD_CELL_CLASSES} text-left`}>Status</th>
                    <th className={`${TABLE_HEAD_CELL_CLASSES} text-left`}>Notes</th>
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
                          {v != null && <Pill tone={v ? "success" : "danger"}>{v ? "Normal" : "Out of range"}</Pill>}
                        </td>
                        <td className={TABLE_CELL_CLASSES}>
                          <p className="max-w-64 truncate" data-tooltip={r.notes ?? undefined}>
                            {r.notes}
                          </p>
                        </td>
                        <td className="py-1.5 pl-3 pr-5 sm:pr-6">
                          <div className="flex justify-end gap-1">
                            <IconAction kind="edit" label="Edit reading" onClick={() => openEdit(r)} />
                            <IconAction
                              kind="delete"
                              label="Delete reading"
                              disabled={saving}
                              onClick={() => void onDelete(r.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        ariaLabelledBy="bp-form-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-lg`}
      >
        <ModalHeader
          id="bp-form-title"
          title={editingId != null ? "Edit reading" : "Add reading"}
          subtitle="Log whatever you measured — every group is optional."
          onClose={closeModal}
        />
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} flex flex-col gap-5`}>
            {error && (
              <ErrorAlert>
                {error}
              </ErrorAlert>
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
            <Field label="Notes">
              <input
                type="text"
                placeholder="After coffee, left arm…"
                className={INPUT_CLASSES}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={saving}
              />
            </Field>
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
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
