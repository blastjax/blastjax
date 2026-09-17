"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartZoomControls } from "@/components/ChartZoomControls";
import { Modal } from "@/components/Modal";
import { useTheme } from "@/components/ThemeProvider";
import { ToggleLegendList } from "@/components/ToggleLegendList";
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
import { fmtIntegerOrDash } from "@/lib/formatNumber";
import {
  ADD_BUTTON_CLASSES,
  CARD_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";
import { useChartZoom } from "@/lib/useChartZoom";

/**
 * A reading is "healthy" when systolic, diastolic, and pulse all sit in the
 * normal resting range (normal BP < 120/80 but not hypotensive, resting pulse
 * 60–100), and — when recorded — SpO2 is at least 95%. Anything outside is
 * flagged "Bad". Readings with no BP/pulse recorded can't be assessed.
 */
function isHealthy(r: {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  spo2: number | null;
}): boolean | null {
  if (r.systolic == null || r.diastolic == null || r.pulse == null) return null;
  return (
    r.systolic >= 90 &&
    r.systolic < 120 &&
    r.diastolic >= 60 &&
    r.diastolic < 80 &&
    r.pulse >= 60 &&
    r.pulse <= 100 &&
    (r.spo2 == null || r.spo2 >= 95)
  );
}

const fmtNum = fmtIntegerOrDash;

const fmtDateTime = formatDateTime;
const fmtChartLabel = formatMonthDayShort;

const SERIES = [
  { key: "systolic", label: "Systolic (mmHg)", color: "#ef4444" },
  { key: "diastolic", label: "Diastolic (mmHg)", color: "#6366f1" },
  { key: "pulse", label: "Pulse (bpm)", color: "#10b981" },
  { key: "spo2", label: "SpO2 (%)", color: "#0ea5e9" },
  { key: "temperature", label: "Temperature (°C)", color: "#f97316" },
  { key: "weight", label: "Weight (kg)", color: "#a855f7" },
] as const;

const emptyForm = { systolic: "", diastolic: "", pulse: "", spo2: "", temperature: "", weight: "", notes: "" };

export default function BloodPressureClient() {
  const [rows, setRows] = useState<BloodPressureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());

  const toggleSeries = (key: string) => {
    setHiddenSeries((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { theme } = useTheme();
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";
  const tooltipStyle = useMemo(() => getChartTooltipStyle(theme), [theme]);
  const trendZoom = useChartZoom();

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

  const summary = useMemo(() => {
    const n = rows.length;
    if (n === 0) {
      return { count: 0, avgSys: 0, avgDia: 0, avgPulse: 0, avgSpo2: NaN, healthy: 0 };
    }
    let sys = 0;
    let dia = 0;
    let pulse = 0;
    let bpCount = 0;
    let spo2 = 0;
    let spo2Count = 0;
    let healthy = 0;
    for (const r of rows) {
      if (r.systolic != null && r.diastolic != null && r.pulse != null) {
        sys += r.systolic;
        dia += r.diastolic;
        pulse += r.pulse;
        bpCount += 1;
      }
      if (r.spo2 != null) {
        spo2 += r.spo2;
        spo2Count += 1;
      }
      if (isHealthy(r)) healthy += 1;
    }
    return {
      count: n,
      avgSys: bpCount > 0 ? sys / bpCount : NaN,
      avgDia: bpCount > 0 ? dia / bpCount : NaN,
      avgPulse: bpCount > 0 ? pulse / bpCount : NaN,
      avgSpo2: spo2Count > 0 ? spo2 / spo2Count : NaN,
      healthy,
    };
  }, [rows]);

  // Chart wants oldest → newest; the API returns newest first.
  const chartPoints = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((r) => ({
          label: fmtChartLabel(r.created_at),
          systolic: r.systolic,
          diastolic: r.diastolic,
          pulse: r.pulse,
          spo2: r.spo2,
          temperature: r.temperature,
          weight: r.weight,
        })),
    [rows],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (r: BloodPressureRow) => {
    setEditingId(r.id);
    setForm({
      systolic: r.systolic == null ? "" : String(r.systolic),
      diastolic: r.diastolic == null ? "" : String(r.diastolic),
      pulse: r.pulse == null ? "" : String(r.pulse),
      spo2: r.spo2 == null ? "" : String(r.spo2),
      temperature: r.temperature == null ? "" : String(r.temperature),
      weight: r.weight == null ? "" : String(r.weight),
      notes: r.notes ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const systolicRaw = form.systolic.trim();
      const diastolicRaw = form.diastolic.trim();
      const pulseRaw = form.pulse.trim();
      const bpRawValues = [systolicRaw, diastolicRaw, pulseRaw];
      const anyBpFilled = bpRawValues.some((v) => v !== "");
      const allBpFilled = bpRawValues.every((v) => v !== "");
      if (anyBpFilled && !allBpFilled) {
        throw new Error("Systolic, diastolic, and pulse must all be filled in together, or all left blank.");
      }
      let systolic: number | null = null;
      let diastolic: number | null = null;
      let pulse: number | null = null;
      if (allBpFilled) {
        systolic = Number(systolicRaw);
        diastolic = Number(diastolicRaw);
        pulse = Number(pulseRaw);
        if (
          !Number.isInteger(systolic) ||
          !Number.isInteger(diastolic) ||
          !Number.isInteger(pulse) ||
          systolic <= 0 ||
          diastolic <= 0 ||
          pulse <= 0
        ) {
          throw new Error("Systolic, diastolic, and pulse must be positive whole numbers.");
        }
      }
      const spo2Raw = form.spo2.trim();
      let spo2: number | null = null;
      if (spo2Raw !== "") {
        spo2 = Number(spo2Raw);
        if (!Number.isInteger(spo2) || spo2 <= 0 || spo2 > 100) {
          throw new Error("SpO2 must be a whole number between 1 and 100.");
        }
      }
      const tempRaw = form.temperature.trim();
      let temperature: number | null = null;
      if (tempRaw !== "") {
        temperature = Number(tempRaw);
        if (Number.isNaN(temperature) || temperature <= 25 || temperature > 45) {
          throw new Error("Temperature must be between 25 and 45 °C.");
        }
      }
      const weightRaw = form.weight.trim();
      let weight: number | null = null;
      if (weightRaw !== "") {
        weight = Number(weightRaw);
        if (Number.isNaN(weight) || weight <= 0) {
          throw new Error("Weight must be a positive number.");
        }
      }
      const notes = form.notes.trim() === "" ? null : form.notes.trim();
      if (systolic == null && spo2 == null && temperature == null && weight == null && notes == null) {
        throw new Error("Please fill in at least one field.");
      }
      const body: BloodPressureCreateBody = {
        systolic,
        diastolic,
        pulse,
        spo2,
        temperature,
        weight,
        notes,
      };
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
      closeModal();
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

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Blood Pressure"
        description={
          <>
            Track readings over time and spot trends before they become a problem.
          </>
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className={CARD_CLASSES}>
            <p className="text-xs font-medium uppercase text-ink-3">Readings</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {fmtNum(summary.count)}
            </p>
          </div>
          <div className={CARD_CLASSES}>
            <p className="text-xs font-medium uppercase text-ink-3">Avg sys / dia</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {fmtNum(summary.avgSys)}/{fmtNum(summary.avgDia)}
            </p>
          </div>
          <div className={CARD_CLASSES}>
            <p className="text-xs font-medium uppercase text-ink-3">Avg pulse</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {fmtNum(summary.avgPulse)}
            </p>
          </div>
          <div className={CARD_CLASSES}>
            <p className="text-xs font-medium uppercase text-ink-3">Avg SpO2</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {Number.isFinite(summary.avgSpo2) ? `${fmtNum(summary.avgSpo2)}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-success-line bg-success-soft p-5 shadow-xs sm:p-6">
            <p className="text-xs font-medium uppercase text-success-text">
              Healthy
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-success-text">
              {fmtNum(summary.healthy)}
              <span className="ml-1 text-sm font-normal text-success-text/70">
                / {fmtNum(summary.count)}
              </span>
            </p>
          </div>
        </section>
      )}

      <section className={CARD_CLASSES}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-ink">
              Trend
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Systolic, diastolic, pulse, SpO2, temperature, and weight over time (oldest to newest).
            </p>
          </div>
          <ChartZoomControls
            zoom={trendZoom.zoom}
            onZoomIn={trendZoom.zoomIn}
            onZoomOut={trendZoom.zoomOut}
            onReset={trendZoom.resetZoom}
            canZoomIn={trendZoom.canZoomIn}
            canZoomOut={trendZoom.canZoomOut}
          />
        </div>
        <div className="mt-4 h-[min(24rem,55vh)] w-full min-h-[240px]">
          {chartPoints.length === 0 ? (
            <p className={DASHED_EMPTY_CLASSES}>
              No readings yet — add one to see the trend.
            </p>
          ) : (
            <div className="h-full w-full overflow-x-auto">
            <div className="h-full" style={{ minWidth: chartScrollMinWidth(chartPoints.length, 56 * trendZoom.zoom) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartPoints}
                margin={{ top: 8, right: 20, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-zinc-200 dark:stroke-zinc-700"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: axisTickFill }}
                  interval={xAxisTickInterval(chartPoints.length, 48)}
                />
                <YAxis tick={{ fontSize: 11, fill: axisTickFill }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  content={(props) => (
                    <ToggleLegendList
                      items={(props.payload ?? []).map((entry) => {
                        const key = String(entry.dataKey ?? entry.value);
                        return {
                          key,
                          label: String(entry.value),
                          color: entry.color ?? "",
                          hidden: hiddenSeries.has(key),
                        };
                      })}
                      onToggle={toggleSeries}
                    />
                  )}
                />
                {SERIES.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={s.color}
                    fillOpacity={0.15}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    hide={hiddenSeries.has(s.key)}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-ink">
            Records
          </h2>
          <button
            type="button"
            className={ADD_BUTTON_CLASSES}
            onClick={openAdd}
          >
            + Add reading
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {!loading &&
            rows.map((r) => {
              const healthy = isHealthy(r);
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center justify-between gap-3 ${CARD_CLASSES}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-ink">
                      {r.systolic != null && r.diastolic != null && (
                        <>
                          {r.systolic}/{r.diastolic}{" "}
                          <span className="text-xs font-normal text-ink-3">mmHg</span>
                        </>
                      )}
                      {r.pulse != null && (
                        <span className="ml-3 text-ink-2">
                          {r.pulse}{" "}
                          <span className="text-xs font-normal text-ink-3">bpm</span>
                        </span>
                      )}
                      {r.spo2 != null && (
                        <span className="ml-3 text-ink-2">
                          {r.spo2}
                          <span className="text-xs font-normal text-ink-3">
                            % SpO2
                          </span>
                        </span>
                      )}
                      {r.temperature != null && (
                        <span className="ml-3 text-ink-2">
                          {r.temperature}
                          <span className="text-xs font-normal text-ink-3">
                            °C
                          </span>
                        </span>
                      )}
                      {r.weight != null && (
                        <span className="ml-3 text-ink-2">
                          {r.weight}
                          <span className="text-xs font-normal text-ink-3">
                            {" "}kg
                          </span>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {fmtDateTime(r.created_at)}
                      {r.notes ? (
                        <>
                          {" · "}
                          <span className="text-sm font-bold text-ink-2">
                            {r.notes}
                          </span>
                        </>
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {healthy != null && (
                      <span
                        className={`text-sm font-semibold ${
                          healthy ? "text-success-text" : "text-danger-text"
                        }`}
                      >
                        {healthy ? "Healthy" : "Bad"}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      className={EDIT_BUTTON_CLASSES}
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      className={DELETE_BUTTON_CLASSES}
                      onClick={() => void onDelete(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          {!loading && rows.length === 0 && (
            <li className={DASHED_EMPTY_CLASSES}>No readings yet.</li>
          )}
        </ul>
      </section>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        ariaLabelledBy="bp-add-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="bp-add-title"
            className="text-lg font-semibold text-ink"
          >
            {editingId != null ? "Edit reading" : "Add reading"}
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closeModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Systolic (mmHg)</span>
            <input
              type="number"
              min={1}
              max={400}
              className={INPUT_CLASSES}
              value={form.systolic}
              onChange={(e) => setForm((f) => ({ ...f, systolic: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Diastolic (mmHg)</span>
            <input
              type="number"
              min={1}
              max={400}
              className={INPUT_CLASSES}
              value={form.diastolic}
              onChange={(e) => setForm((f) => ({ ...f, diastolic: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Pulse (per min)</span>
            <input
              type="number"
              min={1}
              max={400}
              className={INPUT_CLASSES}
              value={form.pulse}
              onChange={(e) => setForm((f) => ({ ...f, pulse: e.target.value }))}
              disabled={saving}
            />
          </label>
          <p className="text-xs text-ink-3 sm:col-span-2">
            Systolic, diastolic, and pulse must be filled in together, or all left blank.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">SpO2 (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              className={INPUT_CLASSES}
              value={form.spo2}
              onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Temperature (°C)</span>
            <input
              type="number"
              min={26}
              max={45}
              step={0.1}
              className={INPUT_CLASSES}
              value={form.temperature}
              onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Weight (kg)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className={INPUT_CLASSES}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Notes</span>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              disabled={saving}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={PRIMARY_BUTTON_CLASSES}
            >
              {saving ? "Saving…" : editingId != null ? "Update" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
