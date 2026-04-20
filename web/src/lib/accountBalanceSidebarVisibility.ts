"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.balanceSidebarAccounts;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeBalanceSidebarHidden(onChange: () => void) {
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

export function getBalanceSidebarHiddenSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = parseHidden(raw);
    return JSON.stringify([...s].sort());
  } catch {
    return "[]";
  }
}

export function loadBalanceSidebarHidden(): Set<string> {
  return parseHidden(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

function saveBalanceSidebarHidden(hidden: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden].sort()));
  emit();
  schedulePersistUserPreferences();
}

/** Hide this account name only in the balance sidebar (rows still appear elsewhere unless hidden in value settings). */
export function setBalanceSidebarAccountShown(account: string, shown: boolean) {
  const next = loadBalanceSidebarHidden();
  const key = String(account);
  if (shown) next.delete(key);
  else next.add(key);
  saveBalanceSidebarHidden(next);
}

export function showAllBalanceSidebarAccounts() {
  saveBalanceSidebarHidden(new Set());
}

export function hideAllBalanceSidebarAccounts(names: string[]) {
  saveBalanceSidebarHidden(new Set(names.map(String)));
}

/** Update sidebar-hidden set when an account label is renamed. */
export function renameAccountInBalanceSidebarHidden(oldName: string, newName: string) {
  if (typeof window === "undefined") return;
  const hidden = loadBalanceSidebarHidden();
  if (!hidden.has(oldName)) return;
  hidden.delete(oldName);
  hidden.add(newName);
  saveBalanceSidebarHidden(hidden);
}

export function useBalanceSidebarHidden(): Set<string> {
  const serialized = useSyncExternalStore(
    subscribeBalanceSidebarHidden,
    getBalanceSidebarHiddenSerialized,
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

/** True when this label is in the “hidden from balance sidebar” set (case-insensitive match). */
export function isAccountHiddenFromBalanceSidebar(
  hidden: Set<string>,
  name: string,
): boolean {
  const raw = String(name);
  if (hidden.has(raw)) return true;
  const nl = raw.toLowerCase();
  for (const h of hidden) {
    if (String(h).toLowerCase() === nl) return true;
  }
  return false;
}

/** Same accounts as the balance sidebar lists after Show (not in sidebar-only hidden set). */
export function isAccountShownInBalanceSidebar(
  hidden: Set<string>,
  name: string,
): boolean {
  return !isAccountHiddenFromBalanceSidebar(hidden, name);
}

export function useIsAccountShownInBalanceSidebar(): (accountName: string) => boolean {
  const sidebarHidden = useBalanceSidebarHidden();
  return useCallback(
    (accountName: string) =>
      isAccountShownInBalanceSidebar(sidebarHidden, accountName),
    [sidebarHidden],
  );
}
