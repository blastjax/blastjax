"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { useQuery } from "@tanstack/react-query";
import { useState, type DragEvent } from "react";
import {
  createCompany,
  DEFAULT_COMPANY_COLUMN_FLAGS,
  deleteCompany,
  errorMessage,
  reorderCompanies,
  updateCompany,
  type CompanyColumnFlags,
  type CompanyRow,
} from "@/lib/api";
import { ErrorAlert } from "@/components/ErrorAlert";
import { Checkbox, Field, FormSection, LoadingBlocks, Panel } from "@/components/FinanceUI";
import { queries } from "@/lib/queries";
import { getQueryClient } from "@/lib/queryClient";
import { useFlashMessage } from "@/lib/useFlashMessage";
import {
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  INPUT_CLASSES,
  LIST_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
} from "@/lib/ui";

type ColumnToggle = { key: keyof CompanyColumnFlags; label: string };

const COLUMN_TOGGLES: { title: string; toggles: ColumnToggle[] }[] = [
  {
    title: "Income",
    toggles: [
      { key: "show_total", label: "Total" },
      { key: "show_basic_salary", label: "Basic salary" },
      { key: "show_commission", label: "Commission" },
      { key: "show_reimbursement", label: "Reimbursement" },
      { key: "show_medical_reimbursement", label: "Medical reimbursement" },
      { key: "show_others", label: "Others" },
      { key: "show_allowances", label: "Allowances" },
      { key: "show_thirteenth_month", label: "13th Month" },
    ],
  },
  {
    title: "Deductions",
    toggles: [
      { key: "show_withholding_tax", label: "Withholding tax" },
      { key: "show_sss_contribution", label: "SSS contribution" },
      { key: "show_philhealth", label: "Philhealth" },
      { key: "show_pag_ibig", label: "Pag-ibig" },
      { key: "show_mp2", label: "MP2" },
      { key: "show_bereavement_asst", label: "Bereavement asst" },
    ],
  },
];

function describeFlags(flags: CompanyColumnFlags): string {
  const hidden = COLUMN_TOGGLES.flatMap((group) => group.toggles)
    .filter((t) => !flags[t.key] && DEFAULT_COMPANY_COLUMN_FLAGS[t.key])
    .map((t) => t.label);
  return hidden.length ? `Hides ${hidden.join(", ")}` : "All columns shown";
}

function ColumnToggles({
  flags,
  setFlags,
}: {
  flags: CompanyColumnFlags;
  setFlags: (flags: CompanyColumnFlags) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink-2">Columns shown on this company&apos;s Payslip page</span>
      <div className="flex flex-col gap-4 pt-1">
        {COLUMN_TOGGLES.map(({ title, toggles }) => (
          <div key={title} className="flex flex-col gap-2">
            <span className={SECTION_LABEL_CLASSES}>{title}</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {toggles.map(({ key, label }) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={flags[key]}
                  onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompaniesSettingsPanel() {
  const companiesQuery = useQuery(queries.companies());
  const companies = companiesQuery.data?.companies ?? [];
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const loadError = companiesQuery.error ? errorMessage(companiesQuery.error, "Failed to load companies.") : deleteError;
  // Shown at once while the new order saves; the save's refetch then confirms it.
  const showOrder = (rows: CompanyRow[]) => getQueryClient().setQueryData(queries.companies().queryKey, { companies: rows });

  const [newName, setNewName] = useState("");
  const [newFlags, setNewFlags] = useState<CompanyColumnFlags>(DEFAULT_COMPANY_COLUMN_FLAGS);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFlags, setEditFlags] = useState<CompanyColumnFlags>(DEFAULT_COMPANY_COLUMN_FLAGS);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [infoMsg, setInfoMsg] = useFlashMessage();
  const [reorderError, setReorderError] = useState<string | null>(null);

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
    } catch (e: unknown) {
      setAddError(errorMessage(e, "Failed to add company."));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(company: CompanyRow) {
    setEditingId(company.id);
    setEditName(company.name);
    setEditFlags(company);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(companyId: string) {
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
    } catch (e: unknown) {
      setEditError(errorMessage(e, "Failed to update company."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(company: CompanyRow) {
    if (!(await confirmDialog(`Delete "${company.name}"?`))) return;
    try {
      await deleteCompany(company.id);
      setInfoMsg(`Deleted "${company.name}".`);
    } catch (e: unknown) {
      setDeleteError(errorMessage(e, "Failed to delete company."));
    }
  }

  function handleCardDragStart(e: DragEvent<HTMLLIElement>, company: CompanyRow) {
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, button, select, option")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", company.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCardDragOver(e: DragEvent<HTMLLIElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function handleCardDrop(e: DragEvent<HTMLLIElement>, onto: CompanyRow) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    if (!fromId || fromId === onto.id) return;

    const previous = companies;
    const next = [...companies];
    const from = next.findIndex((c) => c.id === fromId);
    const to = next.findIndex((c) => c.id === onto.id);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    showOrder(next);
    setReorderError(null);

    try {
      await reorderCompanies(next.map((c) => c.id));
    } catch (e: unknown) {
      showOrder(previous);
      setReorderError(errorMessage(e, "Failed to save the new order."));
    }
  }

  return (
    <Panel
      title="Companies"
      subtitle="Add or manage the companies payslips can be tagged under. Renaming or deleting here doesn't change the company already stored on existing payslips."
    >
      <div className="flex flex-col gap-6">
        {companiesQuery.isPending ? (
          <LoadingBlocks label="Loading companies…" rows={0} />
        ) : loadError ? (
          <ErrorAlert>{loadError}</ErrorAlert>
        ) : companies.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>No companies yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {reorderError && <ErrorAlert>{reorderError}</ErrorAlert>}
            <ul className={LIST_CLASSES}>
              {companies.map((company) => (
                <li
                  key={company.id}
                  className="cursor-grab p-4 active:cursor-grabbing"
                  data-tooltip="Drag to reorder"
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, company)}
                  onDragOver={handleCardDragOver}
                  onDrop={(e) => void handleCardDrop(e, company)}
                >
                  {editingId === company.id ? (
                    <div className="flex flex-col gap-4">
                      <Field label="Name">
                        <input
                          type="text"
                          className={INPUT_CLASSES}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </Field>
                      <ColumnToggles flags={editFlags} setFlags={setEditFlags} />
                      {editError && <ErrorAlert>{editError}</ErrorAlert>}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={PRIMARY_BUTTON_CLASSES}
                          disabled={savingEdit}
                          onClick={() => handleSaveEdit(company.id)}
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={cancelEdit}>
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
                        <button type="button" className={EDIT_BUTTON_CLASSES} onClick={() => startEdit(company)}>
                          Edit
                        </button>
                        <button type="button" className={DELETE_BUTTON_CLASSES} onClick={() => handleDelete(company)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <FormSection title="Add a company">
          <Field label="Name" className="sm:max-w-sm">
            <input
              type="text"
              className={INPUT_CLASSES}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <ColumnToggles flags={newFlags} setFlags={setNewFlags} />
          {addError && <ErrorAlert>{addError}</ErrorAlert>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY_BUTTON_CLASSES} disabled={adding} onClick={handleAdd}>
              {adding ? "Adding…" : "Add company"}
            </button>
            {infoMsg && (
              <span role="status" className="text-sm text-success-text">
                {infoMsg}
              </span>
            )}
          </div>
        </FormSection>
      </div>
    </Panel>
  );
}
