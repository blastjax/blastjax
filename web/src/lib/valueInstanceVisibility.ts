"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { AnalyzeBody } from "@/lib/api";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

/**
 * Columns where settings let you hide specific distinct values (accounts, categories, …).
 * Values are matched as strings (same as facet).
 */
export const VALUE_INSTANCE_COLUMNS = [
  "Accounts",
  "Category",
  "Subcategory",
  "Currency",
  "Income/Expense",
] as const;

export type ValueInstanceColumn = (typeof VALUE_INSTANCE_COLUMNS)[number];

/** column name -> list of instance values to EXCLUDE from dashboard & calendar. */
export type HiddenInstancesMap = Partial<Record<ValueInstanceColumn, string[]>>;

const STORAGE_KEY = USER_PREF_LS_KEYS.valueInstances;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeValueInstances(onChange: () => void) {
  listeners.add(onChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onChange);
    const onPrefsApplied = () => onChange();
    window.addEventListener(PREFS_APPLIED_EVENT, onPrefsApplied);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener(PREFS_APPLIED_EVENT, onPrefsApplied);
    };
  }
  return () => {
    listeners.delete(onChange);
  };
}

function parseMap(raw: string | null): HiddenInstancesMap {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: HiddenInstancesMap = {};
    for (const col of VALUE_INSTANCE_COLUMNS) {
      const v = (data as Record<string, unknown>)[col];
      if (!Array.isArray(v)) continue;
      const list = v.map((x) => String(x));
      if (list.length) out[col] = list;
    }
    return out;
  } catch {
    return {};
  }
}

export function getHiddenInstancesSerialized(): string {
  if (typeof window === "undefined") return "{}";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const m = parseMap(raw);
    return JSON.stringify(m);
  } catch {
    return "{}";
  }
}

export function loadHiddenInstancesMap(): HiddenInstancesMap {
  return parseMap(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

export function saveHiddenInstancesMap(next: HiddenInstancesMap) {
  if (typeof window === "undefined") return;
  const pruned: HiddenInstancesMap = {};
  for (const col of VALUE_INSTANCE_COLUMNS) {
    const list = next[col];
    if (list?.length) pruned[col] = [...new Set(list.map(String))];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  emit();
  schedulePersistUserPreferences();
}

/** Update Accounts hidden list when an account label is renamed. */
export function renameAccountInValueVisibility(oldName: string, newName: string) {
  const m = loadHiddenInstancesMap();
  const acc = m.Accounts;
  if (!acc?.length) return;
  if (!acc.includes(oldName)) return;
  const nextList = acc.map((x) => (x === oldName ? newName : x));
  m.Accounts = [...new Set(nextList)];
  saveHiddenInstancesMap(m);
}

export function setColumnHiddenInstances(
  column: ValueInstanceColumn,
  hidden: string[],
) {
  const cur = loadHiddenInstancesMap();
  if (!hidden.length) {
    delete cur[column];
  } else {
    cur[column] = [...new Set(hidden.map(String))];
  }
  saveHiddenInstancesMap(cur);
}

/** API filters: exclude rows whose column value is in the hidden list. */
export function valueVisibilityFiltersFromMap(
  m: HiddenInstancesMap,
): NonNullable<AnalyzeBody["filters"]> {
  const out: NonNullable<AnalyzeBody["filters"]> = [];
  for (const col of VALUE_INSTANCE_COLUMNS) {
    const hidden = m[col];
    if (hidden?.length) {
      out.push({ column: col, op: "nin", value: hidden });
    }
  }
  return out;
}

/**
 * Match Category / Subcategory facet strings the same way users hide slices:
 * `"Corrections"`, `"(Corrections)"` (like `(Uncategorized)`), or singular `"Correction"`.
 */
function normalizedCategoryAuditLabel(raw: unknown): string {
  let s = String(raw ?? "").trim().toLowerCase();
  if (s.length >= 2 && s.startsWith("(") && s.endsWith(")")) {
    s = s.slice(1, -1).trim().toLowerCase();
  }
  return s;
}

function isCorrectionsLikeAuditCategory(raw: unknown): boolean {
  const inner = normalizedCategoryAuditLabel(raw);
  return inner === "corrections" || inner === "correction";
}

/**
 * Relax `Category` / `Subcategory` `nin` filters so audit categories (e.g. Corrections)
 * still load when drilling an account from the balance sidebar or dashboard.
 */
export function valueVisibilityFiltersForAccountDrill(
  filters: NonNullable<AnalyzeBody["filters"]>,
): NonNullable<AnalyzeBody["filters"]> {
  const out: NonNullable<AnalyzeBody["filters"]> = [];
  for (const f of filters) {
    if (
      (f.column === "Category" || f.column === "Subcategory") &&
      f.op === "nin" &&
      Array.isArray(f.value)
    ) {
      const next = f.value.filter((v) => !isCorrectionsLikeAuditCategory(v));
      if (next.length > 0) {
        out.push({ column: f.column, op: f.op, value: next });
      }
      continue;
    }
    out.push(f);
  }
  return out;
}

export function useValueVisibilityFilters(): AnalyzeBody["filters"] {
  const serialized = useSyncExternalStore(
    subscribeValueInstances,
    getHiddenInstancesSerialized,
    () => "{}",
  );
  return useMemo(
    () => valueVisibilityFiltersFromMap(parseMap(serialized)),
    [serialized],
  );
}

export function useHiddenInstancesMap(): HiddenInstancesMap {
  const serialized = useSyncExternalStore(
    subscribeValueInstances,
    getHiddenInstancesSerialized,
    () => "{}",
  );
  return useMemo(() => parseMap(serialized), [serialized]);
}

export function isInstanceVisible(
  map: HiddenInstancesMap,
  column: ValueInstanceColumn,
  value: string,
): boolean {
  const hidden = map[column];
  if (!hidden?.length) return true;
  return !hidden.includes(value);
}

export function toggleInstanceHidden(
  column: ValueInstanceColumn,
  value: string,
  hide: boolean,
) {
  const cur = loadHiddenInstancesMap();
  const set = new Set(cur[column] ?? []);
  if (hide) set.add(value);
  else set.delete(value);
  const arr = [...set];
  if (!arr.length) {
    delete cur[column];
  } else {
    cur[column] = arr;
  }
  saveHiddenInstancesMap(cur);
}

export function showAllInstancesInColumn(column: ValueInstanceColumn) {
  const cur = loadHiddenInstancesMap();
  delete cur[column];
  saveHiddenInstancesMap(cur);
}

export function hideAllInstancesInColumn(
  column: ValueInstanceColumn,
  allValues: string[],
) {
  const cur = loadHiddenInstancesMap();
  cur[column] = [...new Set(allValues.map(String))];
  saveHiddenInstancesMap(cur);
}
