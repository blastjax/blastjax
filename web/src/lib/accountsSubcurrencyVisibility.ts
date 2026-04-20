"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.accountsSubcurrencyHidden;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAccountsSubcurrencyHidden(onChange: () => void) {
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

function parseHidden(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return new Set();
    return new Set(data.map(String));
  } catch {
    return new Set();
  }
}

export function getAccountsSubcurrencyHiddenSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = parseHidden(raw);
    return JSON.stringify([...s].sort());
  } catch {
    return "[]";
  }
}

export function loadAccountsSubcurrencyHidden(): Set<string> {
  return parseHidden(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

function saveAccountsSubcurrencyHidden(hidden: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden].sort()));
  emit();
  schedulePersistUserPreferences();
}

/** Hide configured subcurrency codes on the Accounts page and from the transaction modal picker. */
export function setAccountsSubcurrencyShown(code: string, shown: boolean) {
  const next = loadAccountsSubcurrencyHidden();
  const key = String(code);
  if (shown) next.delete(key);
  else next.add(key);
  saveAccountsSubcurrencyHidden(next);
}

export function useAccountsSubcurrencyHidden(): Set<string> {
  const serialized = useSyncExternalStore(
    subscribeAccountsSubcurrencyHidden,
    getAccountsSubcurrencyHiddenSerialized,
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

function isInHiddenSet(hidden: Set<string>, code: string): boolean {
  const raw = String(code);
  if (hidden.has(raw)) return true;
  const nl = raw.toLowerCase();
  for (const h of hidden) {
    if (String(h).toLowerCase() === nl) return true;
  }
  return false;
}

/** True when this configured subcurrency code is not in the hidden set (case-insensitive). */
export function isConfiguredSubcurrencyShownInLists(
  hidden: Set<string>,
  code: string,
): boolean {
  return !isInHiddenSet(hidden, code);
}

export function useIsConfiguredSubcurrencyShownInLists(): (
  code: string,
) => boolean {
  const hidden = useAccountsSubcurrencyHidden();
  return useCallback(
    (code: string) => isConfiguredSubcurrencyShownInLists(hidden, code),
    [hidden],
  );
}
