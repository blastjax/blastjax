"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

/** Always hidden from dashboard filters, chart controls, numeric cards, and preview table (still searchable). */
export const FIXED_DASHBOARD_HIDDEN = new Set(["PHP", "id"]);

/** Hidden from dashboard data preview, account drill, and calendar transaction tables (Flow is redundant with Accounts →). */
export const DATA_PREVIEW_EXCLUDED_COLUMNS = new Set([
  "Income/Expense",
  "Currency",
  "Flow",
  "calendar_date",
]);

/** Use when building column lists for any data preview table (dashboard, calendar, account drill). */
export function isColumnExcludedFromDataPreview(name: string): boolean {
  if (DATA_PREVIEW_EXCLUDED_COLUMNS.has(name)) return true;
  return name.trim().toLowerCase() === "currency";
}

/** Columns the user can show or hide on the Settings page (Excel header names). */
export const TOGGLABLE_COLUMNS = [
  "Period",
  "Accounts",
  "Category",
  "Subcategory",
  "Note",
  "Income/Expense",
  "Description",
  "Amount",
  "Currency",
] as const;

export type TogglableColumn = (typeof TOGGLABLE_COLUMNS)[number];

const STORAGE_KEY = USER_PREF_LS_KEYS.columnVisibility;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeColumnVisibility(onChange: () => void) {
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

/** Stable string for useSyncExternalStore (sorted JSON array of hidden column names). */
export function getUserHiddenSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(arr)
      ? [...arr].map(String).filter((s) =>
          TOGGLABLE_COLUMNS.includes(s as TogglableColumn),
        )
      : [];
    list.sort();
    return JSON.stringify(list);
  } catch {
    return "[]";
  }
}

function hiddenSetFromSerialized(serialized: string): Set<string> {
  try {
    const list = JSON.parse(serialized) as unknown;
    if (!Array.isArray(list)) return new Set();
    return new Set(
      list.map(String).filter((s) =>
        TOGGLABLE_COLUMNS.includes(s as TogglableColumn),
      ),
    );
  } catch {
    return new Set();
  }
}

export function loadUserHiddenColumns(): Set<string> {
  return hiddenSetFromSerialized(getUserHiddenSerialized());
}

export function setUserHiddenColumns(hidden: Set<string>) {
  if (typeof window === "undefined") return;
  const allowed = [...hidden].filter((s) =>
    TOGGLABLE_COLUMNS.includes(s as TogglableColumn),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allowed));
  emit();
  schedulePersistUserPreferences();
}

export function toggleUserColumn(column: TogglableColumn, hide: boolean) {
  const next = loadUserHiddenColumns();
  if (hide) next.add(column);
  else next.delete(column);
  setUserHiddenColumns(next);
}

export function useUserHiddenColumns(): Set<string> {
  const serialized = useSyncExternalStore(
    subscribeColumnVisibility,
    getUserHiddenSerialized,
    () => "[]",
  );
  return useMemo(() => hiddenSetFromSerialized(serialized), [serialized]);
}

/** Returns whether a column should appear in dashboard filters, chart dropdowns, numeric summaries, and data preview. */
export function useDashboardColumnVisible(): (name: string) => boolean {
  const userHidden = useUserHiddenColumns();
  return useCallback(
    (name: string) => {
      if (FIXED_DASHBOARD_HIDDEN.has(name)) return false;
      return !userHidden.has(name);
    },
    [userHidden],
  );
}
