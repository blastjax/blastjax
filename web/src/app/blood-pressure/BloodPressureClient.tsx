"use client";

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
import { FloatingAddButton } from "@/components/FloatingAddButton";
import { Modal } from "@/components/Modal";
import { useTheme } from "@/components/ThemeProvider";
import {
  createBloodPressure,
  deleteBloodPressure,
  getBloodPressures,
  updateBloodPressure,
  type BloodPressureCreateBody,
  type BloodPressureRow,
} from "@/lib/api";
import { getChartTooltipStyle } from "@/lib/chartTooltipStyle";
import { formatDateTime, formatMonthDayShort } from "@/lib/dateFormat";
import { DASHED_EMPTY_CLASSES, ERROR_ALERT_CLASSES, PRIMARY_BUTTON_CLASSES } from "@/lib/ui";

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

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

const fmtDateTime = formatDateTime;
const fmtChartLabel = formatMonthDayShort;

const SERIES = [
  { key: "systolic", label: "Systolic (mmHg)", color: "#ef4444", group: "bp" },
  { key: "diastolic", label: "Diastolic (mmHg)", color: "#6366f1", group: "bp" },
  { key: "pulse", label: "Pulse (bpm)", color: "#10b981", group: "bp" },
  { key: "spo2", label: "SpO2 (%)", color: "#0ea5e9", group: "spo2" },
  { key: "temperature", label: "Temperature (°C)", color: "#f97316", group: "temperature" },
  { key: "weight", label: "Weight (kg)", color: "#a855f7", group: "weight" },
] as const;

const CHART_GROUPS = [
  { id: "bp", label: "Blood Pressure", color: "#ef4444" },
  { id: "spo2", label: "SpO2", color: "#0ea5e9" },
  { id: "temperature", label: "Temperature", color: "#f97316" },
  { id: "weight", label: "Weight", color: "#a855f7" },
] as const;

type ChartGroupId = (typeof CHART_GROUPS)[number]["id"];

const emptyForm = { systolic: "", diastolic: "", pulse: "", spo2: "", temperature: "", weight: "", notes: "" };

export default function BloodPressureClient() {
  const [rows, setRows] = useState<BloodPressureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeGroups, setActiveGroups] = useState<Record<ChartGroupId, boolean>>(() =>
    Object.fromEntries(CHART_GROUPS.map((g) => [g.id, true])) as Record<ChartGroupId, boolean>,
  );

  const toggleGroup = (id: ChartGroupId) => {
    setActiveGroups((g) => ({ ...g, [id]: !g[id] }));
  };

  const { theme } = useTheme();
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";
  const tooltipStyle = useMemo(() => getChartTooltipStyle(theme), [theme]);

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
    <div className="relative mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Blood Pressure
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track readings over time and spot trends before they become a problem.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">Readings</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {fmtNum(summary.count)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">Avg sys / dia</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {fmtNum(summary.avgSys)}/{fmtNum(summary.avgDia)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">Avg pulse</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {fmtNum(summary.avgPulse)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">Avg SpO2</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {Number.isFinite(summary.avgSpo2) ? `${fmtNum(summary.avgSpo2)}%` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="text-xs font-medium uppercase text-emerald-800 dark:text-emerald-200">
              Healthy
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {fmtNum(summary.healthy)}
              <span className="ml-1 text-sm font-normal text-emerald-700 dark:text-emerald-300">
                / {fmtNum(summary.count)}
              </span>
            </p>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Trend
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Systolic, diastolic, pulse, SpO2, temperature, and weight over time (oldest to newest).
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {CHART_GROUPS.map((g) => (
            <label
              key={g.id}
              className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                checked={activeGroups[g.id]}
                onChange={() => toggleGroup(g.id)}
                style={{ accentColor: g.color }}
              />
              {g.label}
            </label>
          ))}
        </div>
        <div className="mt-4 h-[min(24rem,55vh)] w-full min-h-[240px]">
          {chartPoints.length === 0 ? (
            <p className={DASHED_EMPTY_CLASSES}>
              No readings yet — add one to see the trend.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartPoints}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-zinc-200 dark:stroke-zinc-700"
                />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisTickFill }} />
                <YAxis tick={{ fontSize: 11, fill: axisTickFill }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {SERIES.filter((s) => activeGroups[s.group]).map((s) => (
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
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Records
        </h2>
        <ul className="mt-4 flex flex-col gap-2">
          {!loading &&
            rows.map((r) => {
              const healthy = isHealthy(r);
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {r.systolic != null && r.diastolic != null && (
                        <>
                          {r.systolic}/{r.diastolic}{" "}
                          <span className="text-xs font-normal text-zinc-500">mmHg</span>
                        </>
                      )}
                      {r.pulse != null && (
                        <span className="ml-3 text-zinc-700 dark:text-zinc-300">
                          {r.pulse}{" "}
                          <span className="text-xs font-normal text-zinc-500">bpm</span>
                        </span>
                      )}
                      {r.spo2 != null && (
                        <span className="ml-3 text-zinc-700 dark:text-zinc-300">
                          {r.spo2}
                          <span className="text-xs font-normal text-zinc-500">
                            % SpO2
                          </span>
                        </span>
                      )}
                      {r.temperature != null && (
                        <span className="ml-3 text-zinc-700 dark:text-zinc-300">
                          {r.temperature}
                          <span className="text-xs font-normal text-zinc-500">
                            °C
                          </span>
                        </span>
                      )}
                      {r.weight != null && (
                        <span className="ml-3 text-zinc-700 dark:text-zinc-300">
                          {r.weight}
                          <span className="text-xs font-normal text-zinc-500">
                            {" "}kg
                          </span>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {fmtDateTime(r.created_at)}
                      {r.notes ? (
                        <>
                          {" · "}
                          <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
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
                          healthy
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {healthy ? "Healthy" : "Bad"}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 sm:px-3 sm:text-sm"
                      onClick={() => openEdit(r)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-300 sm:px-3 sm:text-sm"
                      onClick={() => void onDelete(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          {!loading && rows.length === 0 && (
            <li className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-800 dark:text-zinc-200 dark:border-zinc-700">
              No readings yet.
            </li>
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
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {editingId != null ? "Edit reading" : "Add reading"}
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closeModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Systolic (mmHg)</span>
            <input
              type="number"
              min={1}
              max={400}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.systolic}
              onChange={(e) => setForm((f) => ({ ...f, systolic: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Diastolic (mmHg)</span>
            <input
              type="number"
              min={1}
              max={400}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.diastolic}
              onChange={(e) => setForm((f) => ({ ...f, diastolic: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Pulse (per min)</span>
            <input
              type="number"
              min={1}
              max={400}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.pulse}
              onChange={(e) => setForm((f) => ({ ...f, pulse: e.target.value }))}
              disabled={saving}
            />
          </label>
          <p className="text-xs text-zinc-500 sm:col-span-2">
            Systolic, diastolic, and pulse must be filled in together, or all left blank.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">SpO2 (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.spo2}
              onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Temperature (°C)</span>
            <input
              type="number"
              min={26}
              max={45}
              step={0.1}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.temperature}
              onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Weight (kg)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Notes</span>
            <input
              type="text"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              onClick={closeModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <FloatingAddButton
        hidden={modalOpen}
        onClick={openAdd}
        ariaLabel="Add blood-pressure reading"
      />
    </div>
  );
}
