"use client";

import { useEffect, useState, type DragEvent } from "react";
import {
  createCompany,
  DEFAULT_COMPANY_COLUMN_FLAGS,
  deleteCompany,
  getCompanies,
  reorderCompanies,
  updateCompany,
  type CompanyColumnFlags,
  type CompanyRow,
} from "@/lib/api";
import {
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

/** Every per-company column toggle, grouped and ordered to match the two
 * halves of the Add/Edit Payslip form (the main grid vs. the "Deductions"
 * aside — see PayslipFormFields). All default to shown — see
 * `DEFAULT_COMPANY_COLUMN_FLAGS`. */
const INCOME_COLUMN_TOGGLES: { key: keyof CompanyColumnFlags; label: string }[] = [
  { key: "show_total", label: "Total" },
  { key: "show_basic_salary", label: "Basic salary" },
  { key: "show_commission", label: "Commission" },
  { key: "show_reimbursement", label: "Reimbursement" },
  { key: "show_medical_reimbursement", label: "Medical reimbursement" },
  { key: "show_others", label: "Others" },
  { key: "show_allowances", label: "Allowances" },
  { key: "show_thirteenth_month", label: "13th Month" },
];

const DEDUCTION_COLUMN_TOGGLES: { key: keyof CompanyColumnFlags; label: string }[] = [
  { key: "show_withholding_tax", label: "Withholding tax" },
  { key: "show_sss_contribution", label: "SSS contribution" },
  { key: "show_philhealth", label: "Philhealth" },
  { key: "show_pag_ibig", label: "Pag-ibig" },
  { key: "show_mp2", label: "MP2" },
];

const ALL_COLUMN_TOGGLES = [...INCOME_COLUMN_TOGGLES, ...DEDUCTION_COLUMN_TOGGLES];

/** "All columns shown" for a company that never diverged from the defaults
 * (every flag defaults to shown), otherwise which columns it hides. */
function describeFlags(flags: CompanyColumnFlags): string {
  const hidden = ALL_COLUMN_TOGGLES.filter((t) => !flags[t.key]).map((t) => t.label);
  return hidden.length ? `Hides ${hidden.join(", ")}` : "All columns shown";
}

/** One group of checkboxes (Income or Deductions). */
function ColumnToggleGroup({
  title,
  toggles,
  flags,
  setFlags,
}: {
  title: string;
  toggles: { key: keyof CompanyColumnFlags; label: string }[];
  flags: CompanyColumnFlags;
  setFlags: (flags: CompanyColumnFlags) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {title}
      </span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {toggles.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** All 14 column checkboxes, divided into Income and Deductions, shared by
 * the add and edit forms. */
function ColumnToggleFieldset({
  flags,
  setFlags,
}: {
  flags: CompanyColumnFlags;
  setFlags: (flags: CompanyColumnFlags) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ColumnToggleGroup
        title="Income"
        toggles={INCOME_COLUMN_TOGGLES}
        flags={flags}
        setFlags={setFlags}
      />
      <ColumnToggleGroup
        title="Deductions"
        toggles={DEDUCTION_COLUMN_TOGGLES}
        flags={flags}
        setFlags={setFlags}
      />
    </div>
  );
}

export function CompaniesSettingsPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newFlags, setNewFlags] = useState<CompanyColumnFlags>(
    DEFAULT_COMPANY_COLUMN_FLAGS,
  );
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editFlags, setEditFlags] = useState<CompanyColumnFlags>(
    DEFAULT_COMPANY_COLUMN_FLAGS,
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    getCompanies()
      .then((res) => setCompanies(res.companies))
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Failed to load companies."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!infoMsg) return;
    const t = window.setTimeout(() => setInfoMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [infoMsg]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setAddError("Enter a company name.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createCompany(name, newFlags);
      setNewName("");
      setNewFlags(DEFAULT_COMPANY_COLUMN_FLAGS);
      setInfoMsg(`Added "${name}".`);
      load();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to add company.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(company: CompanyRow) {
    setEditingId(company.id);
    setEditName(company.name);
    // `CompanyRow` carries every `CompanyColumnFlags` field (plus id/name/etc.),
    // so it structurally satisfies the narrower type as-is.
    setEditFlags(company);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(companyId: number) {
    const name = editName.trim();
    if (!name) {
      setEditError("Company name can't be blank.");
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateCompany(companyId, name, editFlags);
      setEditingId(null);
      setInfoMsg("Company updated.");
      load();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update company.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(company: CompanyRow) {
    if (!confirm(`Delete "${company.name}"?`)) return;
    try {
      await deleteCompany(company.id);
      setInfoMsg(`Deleted "${company.name}".`);
      load();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to delete company.");
    }
  }

  function handleCardDragStart(e: DragEvent<HTMLLIElement>, company: CompanyRow) {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, button, select, option")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", String(company.id));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCardDragOver(e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  /** Reorders locally right away, then persists — reverting on failure so the
   * list never quietly disagrees with the sidebar for long. */
  async function handleCardDrop(e: DragEvent<HTMLLIElement>, onto: CompanyRow) {
    e.preventDefault();
    const fromId = Number(e.dataTransfer.getData("text/plain"));
    if (!Number.isFinite(fromId) || fromId === onto.id) return;

    const previous = companies;
    const next = [...companies];
    const from = next.findIndex((c) => c.id === fromId);
    const to = next.findIndex((c) => c.id === onto.id);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCompanies(next);
    setReorderError(null);

    try {
      const res = await reorderCompanies(next.map((c) => c.id));
      setCompanies(res.companies);
    } catch (e: unknown) {
      setCompanies(previous);
      setReorderError(e instanceof Error ? e.message : "Failed to save the new order.");
    }
  }

  return (
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-medium text-ink">Companies</h2>
      <p className="mt-1 text-sm text-ink-2">
        Add or manage the companies payslips can be tagged under. Renaming or
        deleting here doesn&apos;t change the company already stored on
        existing payslips.
      </p>

      <div className="mt-6">
        {loading ? (
          <p className={LOADING_TEXT_CLASSES}>Loading companies…</p>
        ) : loadError ? (
          <div className={ERROR_ALERT_CLASSES} role="alert">{loadError}</div>
        ) : companies.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>No companies yet.</div>
        ) : (
          <>
            {reorderError && (
              <div className={`mb-3 ${ERROR_ALERT_CLASSES}`} role="alert">{reorderError}</div>
            )}
            <ul className="divide-y divide-zinc-200 rounded-lg border border-line dark:divide-zinc-900">
              {companies.map((company) => (
                <li
                  key={company.id}
                  className="cursor-grab p-4 active:cursor-grabbing"
                  title="Drag to reorder"
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, company)}
                  onDragOver={handleCardDragOver}
                  onDrop={(e) => void handleCardDrop(e, company)}
                >
                {editingId === company.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-ink-2">
                        Name
                      </label>
                      <input
                        type="text"
                        className={INPUT_CLASSES}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-2">
                        Columns shown on this company&apos;s Payslip page
                      </span>
                      <ColumnToggleFieldset flags={editFlags} setFlags={setEditFlags} />
                    </div>
                    {editError && <div className={ERROR_ALERT_CLASSES} role="alert">{editError}</div>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={PRIMARY_BUTTON_CLASSES}
                        disabled={savingEdit}
                        onClick={() => handleSaveEdit(company.id)}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASSES}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{company.name}</p>
                      <p className="text-xs text-ink-3">{describeFlags(company)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={EDIT_BUTTON_CLASSES}
                        onClick={() => startEdit(company)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={DELETE_BUTTON_CLASSES}
                        onClick={() => handleDelete(company)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <fieldset className="mt-8 rounded-lg border border-line bg-zinc-50/80 px-4 py-4 dark:bg-zinc-900/40">
        <legend className="px-1 text-sm font-medium text-ink">
          Add a company
        </legend>
        <div className="mt-4 flex flex-col gap-1 sm:max-w-sm">
          <label className="text-xs font-medium text-ink-2">Name</label>
          <input
            type="text"
            className={INPUT_CLASSES}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="mt-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">
            Columns shown on this company&apos;s Payslip page
          </span>
          <ColumnToggleFieldset flags={newFlags} setFlags={setNewFlags} />
        </div>
        {addError && <div className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">{addError}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASSES}
            disabled={adding}
            onClick={handleAdd}
          >
            {adding ? "Adding…" : "Add company"}
          </button>
          {infoMsg && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">{infoMsg}</span>
          )}
        </div>
      </fieldset>
    </section>
  );
}
