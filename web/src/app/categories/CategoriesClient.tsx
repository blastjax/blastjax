"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  createCategoryCatalog,
  createSubcategoryCatalog,
  deleteCategoryCatalog,
  deleteSubcategoryCatalog,
  getCategoryCatalog,
  seedCategoryCatalogFromBudget,
  updateCategoryCatalog,
  updateSubcategoryCatalog,
  type CategoryCatalogEntry,
  type CategoryCatalogKind,
} from "@/lib/api";
import { categoryMatchesCatalogTab } from "@/lib/categoryCatalog";
import {
  btnPrimary,
  btnSecondary,
  fieldLabelText,
  inputClass,
  modalBackdropMobileSheet,
  modalTitle,
} from "@/lib/ui";
import { isReservedCategoryLabel } from "@/lib/reservedCategory";

const KIND_LABEL: Record<CategoryCatalogKind, string> = {
  expense: "Expense",
  income: "Income",
  mixed: "Income & expense",
};

function normalizeKind(k: CategoryCatalogKind | undefined): CategoryCatalogKind {
  return k ?? "expense";
}

export default function CategoriesClient() {
  const [categories, setCategories] = useState<CategoryCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");

  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [editSubName, setEditSubName] = useState("");

  const [newSubName, setNewSubName] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"expense" | "income">("expense");

  const catalogCategories = useMemo(
    () => categories.filter((c) => !isReservedCategoryLabel(c.name)),
    [categories],
  );

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogCategories;
    return catalogCategories
      .map((c) => {
        const catMatch = c.name.toLowerCase().includes(q);
        const subsMatching = c.subcategories.filter((s) =>
          s.name.toLowerCase().includes(q),
        );
        if (catMatch) {
          return c;
        }
        if (subsMatching.length > 0) {
          return { ...c, subcategories: subsMatching };
        }
        return null;
      })
      .filter((c): c is CategoryCatalogEntry => c != null);
  }, [catalogCategories, searchQuery]);

  const tabFilteredCategories = useMemo(
    () =>
      filteredCategories.filter((c) =>
        categoryMatchesCatalogTab(normalizeKind(c.kind), catalogTab),
      ),
    [filteredCategories, catalogTab],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getCategoryCatalog();
      setCategories(r.categories);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load categories. Is the API running?",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelCategoryEdit = useCallback(() => {
    setEditingCatId(null);
  }, []);

  const cancelSubcategoryEdit = useCallback(() => {
    setEditingSubId(null);
  }, []);

  async function onSeedFromBudget() {
    setSaving(true);
    setError(null);
    setSeedMessage(null);
    try {
      const r = await seedCategoryCatalogFromBudget();
      setSeedMessage(
        `Imported ${r.categories_inserted} new categories and ${r.subcategories_inserted} new subcategories from your data.`,
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not import from budget data",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onAddCategory() {
    const name = newCategory.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createCategoryCatalog(name, catalogTab);
      setNewCategory("");
      setAddModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create category");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveCategory(id: number) {
    const name = editCatName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCategoryCatalog(id, { name });
      setEditingCatId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update category");
    } finally {
      setSaving(false);
    }
  }

  async function onSetCategoryKind(id: number, kind: CategoryCatalogKind) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCategoryCatalog(id, { kind });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update category type");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleCategoryHidden(id: number, nextHidden: boolean) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCategoryCatalog(id, { is_hidden: nextHidden });
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update category visibility",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteCategory(id: number) {
    setSaving(true);
    setError(null);
    try {
      await deleteCategoryCatalog(id);
      setEditingCatId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete category");
    } finally {
      setSaving(false);
    }
  }

  async function onAddSubcategory(categoryId: number) {
    const name = (newSubName[categoryId] ?? "").trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createSubcategoryCatalog(categoryId, name);
      setNewSubName((prev) => ({ ...prev, [categoryId]: "" }));
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create subcategory",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSubcategory(id: number) {
    const name = editSubName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateSubcategoryCatalog(id, name);
      setEditingSubId(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update subcategory",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSubcategory(id: number) {
    setSaving(true);
    setError(null);
    try {
      await deleteSubcategoryCatalog(id);
      setEditingSubId(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not delete subcategory",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 pb-28 py-4 sm:px-4">
      <header className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Categories &amp; subcategories
        </h1>
        {seedMessage && (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            {seedMessage}
          </p>
        )}
      </header>

      {error && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-zinc-800 dark:text-zinc-200">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-950/50 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-4">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                New category
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="Name…"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onAddCategory();
                  }}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="shrink-0 rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  disabled={saving || !newCategory.trim()}
                  onClick={() => void onAddCategory()}
                >
                  Add
                </button>
              </div>
            </div>
            <label className="lg:col-span-4">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Search
              </span>
              <input
                type="search"
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="Filter…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search categories and subcategories"
                autoComplete="off"
              />
            </label>
            <div className="flex flex-col gap-1 lg:col-span-4">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Import
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  disabled={saving || loading}
                  onClick={() => void onSeedFromBudget()}
                >
                  From transaction data
                </button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Catalog
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Use the Expenses / Income tabs to manage each side. Types come from
                your transaction Income/Expense column when you import from data;
                you can change them below. “Accounts” is only a column on
                transactions, not a category here. Hide removes a label from
                pickers until you show it again.
              </p>
            </div>
            <div
              className="flex flex-wrap items-center gap-3"
              role="tablist"
              aria-label="Expense or income categories"
            >
              <button
                type="button"
                role="tab"
                aria-selected={catalogTab === "expense"}
                className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                  catalogTab === "expense"
                    ? "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600"
                    : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70"
                }`}
                onClick={() => setCatalogTab("expense")}
              >
                Expenses
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={catalogTab === "income"}
                className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  catalogTab === "income"
                    ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
                    : "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-950/70"
                }`}
                onClick={() => setCatalogTab("income")}
              >
                Income
              </button>
            </div>
            {catalogCategories.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No categories yet. Add one above.
              </p>
            ) : filteredCategories.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No categories or subcategories match &quot;{searchQuery.trim()}
                &quot;.
              </p>
            ) : tabFilteredCategories.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No {catalogTab === "expense" ? "expense" : "income"} categories
                yet
                {searchQuery.trim()
                  ? ` matching “${searchQuery.trim()}”`
                  : ""}
                . Add one above or import from transaction data.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {tabFilteredCategories.map((c) => (
                  <li
                    key={c.id}
                    className={`flex h-full min-h-[12rem] flex-col rounded-lg border p-3 dark:border-zinc-800 ${
                      c.is_hidden === true
                        ? "border-dashed border-zinc-300 bg-zinc-100/60 dark:border-zinc-600 dark:bg-zinc-900/60"
                        : "border-zinc-200 bg-zinc-50/80 dark:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {editingCatId === c.id ? (
                        <div
                          className="flex min-h-[2.75rem] w-full flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                          data-cat-edit-wrap=""
                        >
                          <input
                            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            value={editCatName}
                            onChange={(e) => setEditCatName(e.target.value)}
                            disabled={saving}
                            autoFocus
                            aria-label="Category name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void onSaveCategory(c.id);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelCategoryEdit();
                              }
                            }}
                            onBlur={(e) => {
                              if (saving) return;
                              const rt = e.relatedTarget as Node | null;
                              const wrap = e.currentTarget.closest(
                                "[data-cat-edit-wrap]",
                              );
                              if (rt && wrap?.contains(rt)) return;
                              cancelCategoryEdit();
                            }}
                          />
                          <button
                            type="button"
                            className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:opacity-50 dark:text-white dark:focus-visible:ring-offset-zinc-950"
                            disabled={saving || !editCatName.trim()}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void onSaveCategory(c.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-red-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500 dark:focus-visible:ring-offset-zinc-950"
                            disabled={saving}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void onDeleteCategory(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex min-h-[2.75rem] min-w-0 flex-1 items-center rounded-lg border border-zinc-100 bg-white px-3 py-2 text-left transition hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                            title={`Edit “${c.name}”`}
                            disabled={saving}
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditCatName(c.name);
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                              {c.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            title={
                              c.is_hidden === true
                                ? "Show in transaction pickers"
                                : "Hide from transaction pickers"
                            }
                            disabled={saving}
                            onClick={() =>
                              void onToggleCategoryHidden(
                                c.id,
                                !(c.is_hidden === true),
                              )
                            }
                            className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              c.is_hidden === true
                                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {c.is_hidden === true ? "Show" : "Hide"}
                          </button>
                          <label className="sr-only" htmlFor={`cat-kind-${c.id}`}>
                            Budget type for {c.name}
                          </label>
                          <select
                            id={`cat-kind-${c.id}`}
                            className="max-w-[11rem] shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                            value={normalizeKind(c.kind)}
                            disabled={saving}
                            onChange={(e) =>
                              void onSetCategoryKind(
                                c.id,
                                e.target.value as CategoryCatalogKind,
                              )
                            }
                            title="Expense vs income (from your data, or set manually). “Income & expense” lists under both tabs."
                          >
                            <option value="expense">{KIND_LABEL.expense}</option>
                            <option value="income">{KIND_LABEL.income}</option>
                            <option value="mixed">{KIND_LABEL.mixed}</option>
                          </select>
                        </>
                      )}
                    </div>

                    <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                        Subcategories
                      </p>
                      <ul className="mt-2 grid min-h-0 max-h-64 flex-1 grid-cols-1 gap-x-3 gap-y-2 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-2">
                        {c.subcategories.map((s) => (
                          <li
                            key={s.id}
                            className={
                              editingSubId === s.id ? "sm:col-span-2" : ""
                            }
                          >
                            {editingSubId === s.id ? (
                              <div
                                className="flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                                data-sub-edit-wrap=""
                              >
                                <input
                                  className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                  value={editSubName}
                                  onChange={(e) =>
                                    setEditSubName(e.target.value)
                                  }
                                  disabled={saving}
                                  autoFocus
                                  aria-label="Subcategory name"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void onSaveSubcategory(s.id);
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      cancelSubcategoryEdit();
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (saving) return;
                                    const rt = e.relatedTarget as Node | null;
                                    const wrap = e.currentTarget.closest(
                                      "[data-sub-edit-wrap]",
                                    );
                                    if (rt && wrap?.contains(rt)) return;
                                    cancelSubcategoryEdit();
                                  }}
                                />
                                <button
                                  type="button"
                                  className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:opacity-50 dark:text-white dark:focus-visible:ring-offset-zinc-950"
                                  disabled={saving || !editSubName.trim()}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => void onSaveSubcategory(s.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md bg-red-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500 dark:focus-visible:ring-offset-zinc-950"
                                  disabled={saving}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() =>
                                    void onDeleteSubcategory(s.id)
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="flex min-h-[2.75rem] w-full items-center rounded-lg border border-zinc-100 bg-white px-3 py-2 text-left transition hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                                title={`Edit “${s.name}”`}
                                disabled={saving}
                                onClick={() => {
                                  setEditingSubId(s.id);
                                  setEditSubName(s.name);
                                }}
                              >
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                  {s.name}
                                </span>
                              </button>
                            )}
                          </li>
                        ))}
                        <li className="col-span-full">
                          <label className="flex min-h-[2.75rem] w-full cursor-text items-center rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:hover:border-zinc-500 dark:hover:bg-zinc-900">
                            <input
                              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-0 dark:text-zinc-200 dark:placeholder:text-zinc-500"
                              placeholder="Add subcategory…"
                              value={newSubName[c.id] ?? ""}
                              onChange={(e) =>
                                setNewSubName((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  void onAddSubcategory(c.id);
                              }}
                              disabled={saving}
                              aria-label="Add subcategory"
                            />
                          </label>
                        </li>
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {addModalOpen && (
        <div
          className={modalBackdropMobileSheet}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cat-add-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="cat-add-title" className={modalTitle}>
              New category
            </h2>
            <label className={`mt-4 flex flex-col gap-1 ${fieldLabelText}`}>
              <span>Name</span>
              <input
                className={inputClass}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onAddCategory();
                }}
                disabled={saving}
                autoFocus
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setAddModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || !newCategory.trim()}
                onClick={() => void onAddCategory()}
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
      <FloatingAddButton
        hidden={addModalOpen}
        onClick={() => setAddModalOpen(true)}
        ariaLabel="Add category"
      />
    </div>
  );
}
