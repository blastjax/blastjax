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

/**
 * A reading is "healthy" when systolic, diastolic, and pulse all sit in the
 * normal resting range (normal BP < 120/80 but not hypotensive, resting pulse
 * 60–100). Anything outside is flagged "Bad".
 */
function isHealthy(r: { systolic: number; diastolic: number; pulse: number }): boolean {
  return (
    r.systolic >= 90 &&
    r.systolic < 120 &&
    r.diastolic >= 60 &&
    r.diastolic < 80 &&
    r.pulse >= 60 &&
    r.pulse <= 100
  );
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtChartLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SERIES = [
  { key: "systolic", label: "Systolic (mmHg)", color: "#ef4444" },
  { key: "diastolic", label: "Diastolic (mmHg)", color: "#6366f1" },
  { key: "pulse", label: "Pulse (bpm)", color: "#10b981" },
] as const;

const emptyForm = { systolic: "", diastolic: "", pulse: "", notes: "" };

export default function BloodPressureClient() {
  const [rows, setRows] = useState<BloodPressureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { theme } = useTheme();
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";
  const tooltipStyle = useMemo(
    () =>
      theme === "dark"
        ? {
            backgroundColor: "rgba(24, 24, 27, 0.92)",
            border: "1px solid rgb(63 63 70)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#fafafa",
          }
        : {
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            border: "1px solid rgb(228 228 231)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#18181b",
          },
    [theme],
  );

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
      return { count: 0, avgSys: 0, avgDia: 0, avgPulse: 0, healthy: 0 };
    }
    let sys = 0;
    let dia = 0;
    let pulse = 0;
    let healthy = 0;
    for (const r of rows) {
      sys += r.systolic;
      dia += r.diastolic;
      pulse += r.pulse;
      if (isHealthy(r)) healthy += 1;
    }
    return {
      count: n,
      avgSys: sys / n,
      avgDia: dia / n,
      avgPulse: pulse / n,
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
      systolic: String(r.systolic),
      diastolic: String(r.diastolic),
      pulse: String(r.pulse),
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
      const systolic = Number(form.systolic);
      const diastolic = Number(form.diastolic);
      const pulse = Number(form.pulse);
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
      const body: BloodPressureCreateBody = {
        systolic,
        diastolic,
        pulse,
        notes: form.notes.trim() === "" ? null : form.notes.trim(),
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
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          Systolic, diastolic, and pulse over time (oldest to newest).
        </p>
        <div className="mt-6 h-[min(24rem,55vh)] w-full min-h-[240px]">
          {chartPoints.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
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
                      {r.systolic}/{r.diastolic}{" "}
                      <span className="text-xs font-normal text-zinc-500">mmHg</span>
                      <span className="ml-3 text-zinc-700 dark:text-zinc-300">
                        {r.pulse}{" "}
                        <span className="text-xs font-normal text-zinc-500">bpm</span>
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {fmtDateTime(r.created_at)}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold ${
                        healthy
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {healthy ? "Healthy" : "Bad"}
                    </span>
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
              required
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
              required
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
              required
              type="number"
              min={1}
              max={400}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.pulse}
              onChange={(e) => setForm((f) => ({ ...f, pulse: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Notes (optional)</span>
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
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
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
