"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  createPayslip,
  deletePayslip,
  getPayslip,
  getPayslips,
  updatePayslip,
  type PayslipCreateBody,
  type PayslipRow,
} from "@/lib/api";
import {
  clearPayslipModalDraft,
  formFromRow,
  formToCreateBody,
  payslipDraftKeyEdit,
  stashPayslipModalDraft,
} from "./payslipDraft";
import {
  detailPayslipNeighbors,
  rowsForSlot,
  unscheduledRows,
  yearsToShow,
} from "./payslipAggregates";
import { fmtNum } from "./payslipDisplay";
import {
  emptyForm,
  initialAddPayslipForm,
  initialManualPayslipForm,
  loadPayslipDefaultsBundle,
  payslipDefaultsFormForSlotHalf,
  PAYSLIP_DEFAULTS_SAVED_EVENT,
  tryParseFormStateJson,
  type FormState,
} from "./payslipModalForm";
import type { Nav } from "./payslipNav";
import { PayslipClientModal } from "./PayslipClientModal";
import { PayslipYearStatsSection } from "./PayslipYearStatsSection";
import { YearPayslipBlock } from "./YearPayslipBlock";

export default function PayslipClient() {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [modalForm, setModalForm] = useState<FormState>(emptyForm());
  const modalFormRef = useRef(modalForm);
  modalFormRef.current = modalForm;
  const navRef = useRef(nav);
  navRef.current = nav;

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getPayslips(2000);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduledSlotFromBody = (
    body: PayslipCreateBody,
  ): { year: number; month: number; half: 1 | 2 } | null => {
    const { period_year: year, period_month: month, period_half: half } = body;
    if (
      year == null ||
      !Number.isFinite(year) ||
      month == null ||
      month < 1 ||
      month > 12 ||
      (half !== 1 && half !== 2)
    ) {
      return null;
    }
    return {
      year: Math.trunc(year),
      month: Math.trunc(month),
      half: half === 1 ? 1 : 2,
    };
  };

  const existingScheduledRowForBody = (body: PayslipCreateBody) => {
    const slot = scheduledSlotFromBody(body);
    if (!slot) return null;
    return rowsForSlot(rows, slot.year, slot.month, slot.half)[0] ?? null;
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!nav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        nav.screen === "edit" ||
        nav.screen === "add" ||
        nav.screen === "manual"
      ) {
        stashPayslipModalDraft(nav, modalFormRef.current);
      }
      setNav(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const saveManualAdd = async () => {
    if (nav?.screen !== "manual") return;
    setSaving(true);
    setError(null);
    try {
      const body = formToCreateBody(modalForm);
      const existing = existingScheduledRowForBody(body);
      if (existing) {
        await updatePayslip(existing.id, body);
        clearPayslipModalDraft(nav);
        const updated = await getPayslip(existing.id);
        await load();
        setNav({ screen: "detail", row: updated });
        return;
      }
      await createPayslip(body);
      clearPayslipModalDraft(nav);
      setNav(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openSlot = (year: number, month: number, half: 1 | 2) => {
    const items = rowsForSlot(rows, year, month, half);
    if (items.length === 0) {
      setNav({ screen: "add", year, month, half });
    } else {
      setNav({ screen: "detail", row: items[0] });
    }
  };

  const goBack = () => {
    setNav((n) => {
      if (!n) return null;
      if (n.screen === "edit") {
        stashPayslipModalDraft(n, modalFormRef.current);
        const fresh = rows.find((r) => r.id === n.row.id);
        return { screen: "detail", row: fresh ?? n.row };
      }
      if (n.screen === "add") {
        stashPayslipModalDraft(n, modalFormRef.current);
        const slotRows = rowsForSlot(rows, n.year, n.month, n.half);
        if (slotRows.length === 0) {
          return null;
        }
        return { screen: "slot", year: n.year, month: n.month, half: n.half };
      }
      if (n.screen === "detail") {
        const y = n.row.period_year;
        const m = n.row.period_month;
        const h = n.row.period_half;
        if (
          y != null &&
          m != null &&
          (h === 1 || h === 2)
        ) {
          return { screen: "slot", year: y, month: m, half: h };
        }
        return null;
      }
      return null;
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this payslip row?")) return;
    setSaving(true);
    setError(null);
    try {
      await deletePayslip(id);
      setNav((n) => {
        if (n?.screen === "detail" && n.row.id === id) return null;
        if (n?.screen === "edit" && n.row.id === id) return null;
        return n;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (nav?.screen !== "edit") return;
    const id = nav.row.id;
    setSaving(true);
    setError(null);
    try {
      await updatePayslip(id, formToCreateBody(modalForm));
      clearPayslipModalDraft(nav);
      const updated = await getPayslip(id);
      await load();
      setNav({ screen: "detail", row: updated });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAddInModal = async () => {
    if (nav?.screen !== "add") return;
    setSaving(true);
    setError(null);
    try {
      const body = formToCreateBody(modalForm);
      const existing = rowsForSlot(rows, nav.year, nav.month, nav.half)[0];
      if (existing) {
        await updatePayslip(existing.id, body);
        clearPayslipModalDraft(nav);
        const updated = await getPayslip(existing.id);
        await load();
        setNav({ screen: "detail", row: updated });
        return;
      }
      await createPayslip(body);
      clearPayslipModalDraft(nav);
      await load();
      setNav({
        screen: "slot",
        year: nav.year,
        month: nav.month,
        half: nav.half,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Sync modal form when entering edit/add/manual (restore session draft if present)
  useEffect(() => {
    if (!nav) return;
    if (nav.screen === "edit") {
      const raw = sessionStorage.getItem(payslipDraftKeyEdit(nav.row.id));
      if (raw) {
        const d = tryParseFormStateJson(raw);
        if (d) {
          setModalForm(d);
          return;
        }
      }
      setModalForm(formFromRow(nav.row));
    } else if (nav.screen === "add") {
      const b = loadPayslipDefaultsBundle();
      setModalForm(
        initialAddPayslipForm(
          nav.year,
          nav.month,
          nav.half,
          payslipDefaultsFormForSlotHalf(b, nav.half),
        ),
      );
    } else if (nav.screen === "manual") {
      const b = loadPayslipDefaultsBundle();
      setModalForm(initialManualPayslipForm(b.formFirst, b.formSecond));
    }
  }, [nav]);

  useEffect(() => {
    const onDefaultsSaved = () => {
      const n = navRef.current;
      if (!n || (n.screen !== "add" && n.screen !== "manual")) return;
      clearPayslipModalDraft(n);
      const b = loadPayslipDefaultsBundle();
      if (n.screen === "add") {
        setModalForm(
          initialAddPayslipForm(
            n.year,
            n.month,
            n.half,
            payslipDefaultsFormForSlotHalf(b, n.half),
          ),
        );
      } else {
        setModalForm(initialManualPayslipForm(b.formFirst, b.formSecond));
      }
    };
    window.addEventListener(PAYSLIP_DEFAULTS_SAVED_EVENT, onDefaultsSaved);
    return () => {
      window.removeEventListener(
        PAYSLIP_DEFAULTS_SAVED_EVENT,
        onDefaultsSaved,
      );
    };
  }, []);

  useEffect(() => {
    if (!nav || nav.screen !== "detail") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select") ||
        el?.isContentEditable
      ) {
        return;
      }
      const { older, newer } = detailPayslipNeighbors(rows, nav.row.id);
      if (e.key === "ArrowLeft" && older) {
        e.preventDefault();
        setNav({ screen: "detail", row: older });
      } else if (e.key === "ArrowRight" && newer) {
        e.preventDefault();
        setNav({ screen: "detail", row: newer });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav, rows]);

  const years = yearsToShow(rows);
  const unsorted = unscheduledRows(rows);

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-12 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Payslip
        </h1>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Pay period calendar
            </h2>
          </div>
        </div>

        {!loading && <PayslipYearStatsSection rows={rows} />}

        {!loading && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {years.map((year) => (
              <div key={year} className="min-w-0">
                <YearPayslipBlock
                  year={year}
                  rows={rows}
                  saving={saving}
                  onOpenSlot={openSlot}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && unsorted.length > 0 && (
          <div className="mt-10 border-t border-amber-200 pt-8 dark:border-amber-900/50">
            <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              Without pay period ({unsorted.length})
            </h3>
            <ul className="flex flex-col gap-2">
              {unsorted.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
                    #{r.id} · Total {fmtNum(r.total)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
                      onClick={() =>
                        setNav({ screen: "detail", row: r })
                      }
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
                      onClick={() => {
                        setModalForm(formFromRow(r));
                        setNav({ screen: "edit", row: r });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      onClick={() => void handleDelete(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {nav && (
        <PayslipClientModal
          nav={nav}
          setNav={setNav}
          rows={rows}
          modalForm={modalForm}
          setModalForm={setModalForm}
          saving={saving}
          modalFormRef={modalFormRef}
          goBack={goBack}
          saveEdit={saveEdit}
          saveAddInModal={saveAddInModal}
          saveManualAdd={saveManualAdd}
          handleDelete={handleDelete}
        />
      )}

      <FloatingAddButton
        hidden={!!nav}
        onClick={() => setNav({ screen: "manual" })}
      />
    </div>
  );
}
