"use client";

import { useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.manualAccounts;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map(String).map((s) => s.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function subscribeManualAccounts(onChange: () => void) {
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

export function getManualAccountsSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function getManualAccounts(): string[] {
  return parseList(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

function saveManualAccounts(names: string[]) {
  if (typeof window === "undefined") return;
  const sorted = [...new Set(names.map((s) => s.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  emit();
  schedulePersistUserPreferences();
}

export function addManualAccount(name: string) {
  const t = name.trim();
  if (!t) return;
  const cur = getManualAccounts();
  if (cur.some((x) => x.toLowerCase() === t.toLowerCase())) return;
  saveManualAccounts([...cur, t]);
}

export function removeManualAccount(name: string) {
  const cur = getManualAccounts();
  saveManualAccounts(cur.filter((x) => x !== name));
}

export function renameManualAccountLabel(oldName: string, newName: string) {
  const t = newName.trim();
  if (!t) return;
  const cur = getManualAccounts();
  if (!cur.includes(oldName)) return;
  const next = cur
    .map((x) => (x === oldName ? t : x))
    .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  saveManualAccounts(next);
}

export function useManualAccounts(): string[] {
  const raw = useSyncExternalStore(
    subscribeManualAccounts,
    getManualAccountsSerialized,
    () => "[]",
  );
  return useMemo(() => parseList(raw), [raw]);
}
