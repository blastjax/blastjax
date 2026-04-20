"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.balanceSidebarTotalExcluded;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeBalanceSidebarTotalExcluded(onChange: () => void) {
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

function parseExcluded(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return new Set();
    return new Set(data.map(String));
  } catch {
    return new Set();
  }
}

export function getBalanceSidebarTotalExcludedSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = parseExcluded(raw);
    return JSON.stringify([...s].sort());
  } catch {
    return "[]";
  }
}

export function loadBalanceSidebarTotalExcluded(): Set<string> {
  return parseExcluded(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

function saveBalanceSidebarTotalExcluded(excluded: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...excluded].sort()));
  emit();
  schedulePersistUserPreferences();
}

/**
 * When `excluded` is true, the account still appears in the sidebar but does not count
 * toward the combined total and is styled in grey.
 */
export function setAccountExcludedFromBalanceTotal(account: string, excluded: boolean) {
  const next = loadBalanceSidebarTotalExcluded();
  const key = String(account);
  if (excluded) next.add(key);
  else next.delete(key);
  saveBalanceSidebarTotalExcluded(next);
}

/** Update exclusion set when an account label is renamed. */
export function renameAccountInBalanceTotalExcluded(oldName: string, newName: string) {
  if (typeof window === "undefined") return;
  const ex = loadBalanceSidebarTotalExcluded();
  if (!ex.has(oldName)) return;
  ex.delete(oldName);
  ex.add(newName);
  saveBalanceSidebarTotalExcluded(ex);
}

export function useBalanceSidebarTotalExcluded(): Set<string> {
  const serialized = useSyncExternalStore(
    subscribeBalanceSidebarTotalExcluded,
    getBalanceSidebarTotalExcludedSerialized,
    () => "[]",
  );
  return useMemo(() => {
    try {
      const list = JSON.parse(serialized) as unknown;
      if (!Array.isArray(list)) return new Set();
      return new Set(list.map(String));
    } catch {
      return new Set();
    }
  }, [serialized]);
}

/** True when this label is in the “excluded from sidebar total” set (case-insensitive match). */
export function isAccountExcludedFromBalanceTotal(
  excluded: Set<string>,
  name: string,
): boolean {
  const raw = String(name);
  if (excluded.has(raw)) return true;
  const nl = raw.toLowerCase();
  for (const h of excluded) {
    if (String(h).toLowerCase() === nl) return true;
  }
  return false;
}

/** Included in the sidebar total row (shown accounts only; not in exclusion set). */
export function isAccountIncludedInBalanceTotal(
  excluded: Set<string>,
  name: string,
): boolean {
  return !isAccountExcludedFromBalanceTotal(excluded, name);
}

export function useIsAccountIncludedInBalanceTotal(): (accountName: string) => boolean {
  const excluded = useBalanceSidebarTotalExcluded();
  return useCallback(
    (accountName: string) =>
      isAccountIncludedInBalanceTotal(excluded, accountName),
    [excluded],
  );
}
