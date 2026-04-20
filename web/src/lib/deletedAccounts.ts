"use client";

import { useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.deletedAccounts;

export type DeletedAccountEntry = {
  name: string;
  /** True if the name was only in the manual list when removed (not in DB distinct accounts). */
  manualOnly: boolean;
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeDeletedAccounts(onChange: () => void) {
  listeners.add(onChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onChange);
    const onPrefs = () => onChange();
    window.addEventListener(PREFS_APPLIED_EVENT, onPrefs);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener(PREFS_APPLIED_EVENT, onPrefs);
    };
  }
  return () => {
    listeners.delete(onChange);
  };
}

function parseList(raw: string | null): DeletedAccountEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: DeletedAccountEntry[] = [];
    const seen = new Set<string>();
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) continue;
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        name,
        manualOnly: Boolean(o.manualOnly),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function getDeletedAccountsSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function getDeletedAccounts(): DeletedAccountEntry[] {
  return parseList(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

function saveDeletedAccounts(entries: DeletedAccountEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  emit();
  schedulePersistUserPreferences();
}

export function addDeletedAccount(name: string, manualOnly: boolean) {
  const t = name.trim();
  if (!t) return;
  const cur = getDeletedAccounts();
  if (cur.some((x) => x.name.toLowerCase() === t.toLowerCase())) return;
  saveDeletedAccounts([...cur, { name: t, manualOnly }]);
}

export function removeDeletedAccount(name: string) {
  const k = name.toLowerCase();
  const cur = getDeletedAccounts();
  saveDeletedAccounts(cur.filter((x) => x.name.toLowerCase() !== k));
}

/** After renaming an account everywhere else, keep trash in sync. */
export function renameDeletedAccountLabel(oldName: string, newName: string) {
  const t = newName.trim();
  if (!t) return;
  const cur = getDeletedAccounts();
  const idx = cur.findIndex(
    (x) => x.name.toLowerCase() === oldName.toLowerCase(),
  );
  if (idx < 0) return;
  const next = [...cur];
  if (next.some((x, i) => i !== idx && x.name.toLowerCase() === t.toLowerCase())) {
    next.splice(idx, 1);
  } else {
    next[idx] = { ...next[idx], name: t };
  }
  saveDeletedAccounts(next);
}

export function isAccountInDeletedList(
  name: string,
  deleted: readonly DeletedAccountEntry[],
): boolean {
  const k = name.toLowerCase();
  return deleted.some((x) => x.name.toLowerCase() === k);
}

export function useDeletedAccounts(): DeletedAccountEntry[] {
  const raw = useSyncExternalStore(
    subscribeDeletedAccounts,
    getDeletedAccountsSerialized,
    () => "[]",
  );
  return useMemo(() => parseList(raw), [raw]);
}
