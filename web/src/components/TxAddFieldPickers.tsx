"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  btnGhost,
  btnPrimary,
  fieldLabelText,
  fieldTriggerButton,
  inputClass,
  modalBackdropHigh,
  pickerOption,
  pickerOptionNone,
} from "@/lib/ui";

type PickerModalProps = {
  open: boolean;
  title: string;
  options: string[];
  onClose: () => void;
  /** Return `false` to keep the picker open (e.g. drill from category to subcategories). */
  onSelect: (value: string) => boolean | void;
  /** Shown when `options` is empty (when `includeNoneOption`, the “(none)” control may still appear). */
  emptyMessage?: string;
  /** When set, show a field to create a new catalog entry (category or subcategory). */
  onAddNew?: (trimmedName: string) => Promise<void>;
  addNewPlaceholder?: string;
  /** Filter options by the search box (accounts, categories, subcategories). Default true. */
  searchable?: boolean;
  /** Show the “(none)” quick option. Default true; set false for account pickers. */
  includeNoneOption?: boolean;
  /** Drag chips to reorder when search is empty; persists via parent `onReorder`. */
  reorderable?: boolean;
  onReorder?: (nextOrder: string[]) => void;
  /** Second step (e.g. subcategories); shows above the title. */
  onBack?: () => void;
};

function reorderStringArray(arr: string[], fromIndex: number, toIndex: number) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= arr.length ||
    toIndex >= arr.length
  ) {
    return [...arr];
  }
  const next = [...arr];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

/**
 * Second-level modal for add-transaction: choose account, category, or subcategory via buttons.
 */
export function TxAddFieldPickerModal({
  open,
  title,
  options,
  onClose,
  onSelect,
  emptyMessage,
  onAddNew,
  addNewPlaceholder,
  searchable = true,
  includeNoneOption = true,
  reorderable = false,
  onReorder,
  onBack,
}: PickerModalProps) {
  const [addNewDraft, setAddNewDraft] = useState("");
  const [addNewBusy, setAddNewBusy] = useState(false);
  const [addNewError, setAddNewError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** Suppress one click on option chips after a successful drag-reorder (avoids accidental select). */
  const suppressOptionClickRef = useRef(false);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const canReorder =
    reorderable &&
    typeof onReorder === "function" &&
    options.length > 1 &&
    !searchQuery.trim();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setAddNewDraft("");
      setAddNewError(null);
      setAddNewBusy(false);
      setSearchQuery("");
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, title]);

  if (!open) return null;

  function afterSelect(v: string) {
    if (onSelect(v) === false) return;
    onClose();
  }

  async function handleAddNew() {
    if (!onAddNew) return;
    const t = addNewDraft.trim();
    if (!t) return;
    setAddNewBusy(true);
    setAddNewError(null);
    try {
      await onAddNew(t);
      setAddNewDraft("");
      afterSelect(t);
    } catch (e) {
      setAddNewError(
        e instanceof Error ? e.message : "Could not add. Try another name.",
      );
    } finally {
      setAddNewBusy(false);
    }
  }

  return (
    <div
      className={modalBackdropHigh}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(32rem,85vh)] w-full max-w-md flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal
        aria-labelledby="tx-add-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {onBack ? (
              <button
                type="button"
                className="mb-1.5 block text-left text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={onBack}
              >
                ← Categories
              </button>
            ) : null}
            <h4
              id="tx-add-picker-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {title}
            </h4>
          </div>
          <button type="button" className={btnGhost} onClick={onClose}>
            Close
          </button>
        </div>
        {searchable ? (
          <label className="flex flex-col gap-1">
            <span className={fieldLabelText}>Search</span>
            <input
              ref={searchInputRef}
              type="search"
              className={inputClass}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to filter…"
              aria-label={`Search ${title}`}
              autoComplete="off"
            />
          </label>
        ) : null}
        <div className="max-h-[min(22rem,50vh)] overflow-y-auto">
          {searchable && searchQuery.trim() && reorderable && options.length > 1 ? (
            <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Clear search to reorder.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {includeNoneOption ? (
              <button
                type="button"
                className={pickerOptionNone}
                onClick={() => {
                  afterSelect("");
                }}
              >
                (none)
              </button>
            ) : null}
            {options.length === 0 ? (
              <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">
                {emptyMessage ?? "No options yet."}
              </p>
            ) : filteredOptions.length === 0 ? (
              <p className="w-full text-sm text-zinc-500 dark:text-zinc-400">
                No matches for your search.
              </p>
            ) : canReorder ? (
              options.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  type="button"
                  draggable
                  title="Drag to reorder, or click to select"
                  className={`${pickerOption} cursor-grab touch-none select-none active:cursor-grabbing`}
                  onDragStart={(e) => {
                    const s = String(i);
                    e.dataTransfer.setData("text/plain", s);
                    e.dataTransfer.setData(
                      "application/x-budgetapp-tx-picker-idx",
                      s,
                    );
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw =
                      e.dataTransfer.getData(
                        "application/x-budgetapp-tx-picker-idx",
                      ) || e.dataTransfer.getData("text/plain");
                    const from = parseInt(raw, 10);
                    if (Number.isNaN(from) || !onReorder) return;
                    if (from === i) return;
                    const next = reorderStringArray(options, from, i);
                    onReorder(next);
                    suppressOptionClickRef.current = true;
                  }}
                  onClick={() => {
                    if (suppressOptionClickRef.current) {
                      suppressOptionClickRef.current = false;
                      return;
                    }
                    afterSelect(opt);
                  }}
                >
                  {opt || "(empty)"}
                </button>
              ))
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt || "__empty"}
                  type="button"
                  className={pickerOption}
                  onClick={() => {
                    afterSelect(opt);
                  }}
                >
                  {opt || "(empty)"}
                </button>
              ))
            )}
          </div>
        </div>
        {onAddNew ? (
          <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <p className={`${fieldLabelText} mb-1.5`}>Add new</p>
            <div className="flex gap-2">
              <input
                type="text"
                className={`${inputClass} min-w-0 flex-1`}
                value={addNewDraft}
                placeholder={addNewPlaceholder ?? "Name"}
                disabled={addNewBusy}
                onChange={(e) => setAddNewDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddNew();
                  }
                }}
                aria-label="New name"
              />
              <button
                type="button"
                className={`${btnPrimary} shrink-0`}
                disabled={addNewBusy || !addNewDraft.trim()}
                onClick={() => void handleAddNew()}
              >
                {addNewBusy ? "…" : "Add"}
              </button>
            </div>
            {addNewError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {addNewError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type TriggerProps = {
  label: string;
  value: string;
  placeholder: string;
  onOpen: () => void;
};

/** Opens the picker modal; shows current value or placeholder. */
export function TxAddFieldTriggerButton({
  label,
  value,
  placeholder,
  onOpen,
}: TriggerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className={fieldLabelText}>{label}</span>
      <button
        type="button"
        onClick={onOpen}
        className={fieldTriggerButton}
      >
        <span
          className={
            value.trim() ? "" : "text-zinc-400 dark:text-zinc-500"
          }
        >
          {value.trim() ? value : placeholder}
        </span>
      </button>
    </div>
  );
}
