"use client";

import { useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import { applyNameOrder } from "@/lib/stringListOrder";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.accountOrder;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAccountOrder(onChange: () => void) {
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

function parseOrder(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.map(String);
  } catch {
    return [];
  }
}

export function getAccountOrderSerialized(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function getAccountOrder(): string[] {
  return parseOrder(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

export function setAccountOrder(order: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  emit();
  schedulePersistUserPreferences();
}

/** Replace a stored account name (e.g. after rename in DB). */
export function renameAccountInOrder(oldName: string, newName: string) {
  if (typeof window === "undefined") return;
  const o = getAccountOrder();
  if (!o.includes(oldName)) return;
  setAccountOrder(o.map((x) => (x === oldName ? newName : x)));
}

export function useAccountOrder(): string[] {
  const raw = useSyncExternalStore(
    subscribeAccountOrder,
    getAccountOrderSerialized,
    () => "[]",
  );
  return useMemo(() => parseOrder(raw), [raw]);
}

/**
 * Apply saved order: known order entries first (that exist in `fullNames`),
 * then any remaining names sorted alphabetically.
 */
export function applyAccountOrder(
  fullNames: string[],
  order: string[],
): string[] {
  return applyNameOrder(fullNames, order);
}

/**
 * After reordering the full pickable list in the transaction modal, merge with
 * stored order so accounts not in the picker (e.g. hidden) keep their tail positions.
 */
export function mergeOrderAfterPickerReorder(
  pickableOrdered: string[],
  currentOrder: string[],
): string[] {
  const pset = new Set(pickableOrdered.map((s) => s.toLowerCase()));
  const rest = currentOrder.filter((n) => !pset.has(n.toLowerCase()));
  return [...pickableOrdered, ...rest];
}

/**
 * After reordering visible accounts in the balance sidebar, update stored order.
 * Hidden (sidebar) accounts keep their relative tail order; new names append sorted.
 */
export function mergeOrderAfterVisibleReorder(
  newVisibleOrder: string[],
  allNames: string[],
): void {
  const vis = new Set(newVisibleOrder);
  const cur = getAccountOrder();
  const hiddenPreserve = cur.filter(
    (n) => !vis.has(n) && allNames.includes(n),
  );
  const seen = new Set<string>([...newVisibleOrder, ...hiddenPreserve]);
  const tail = allNames
    .filter((n) => !seen.has(n))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  setAccountOrder([...newVisibleOrder, ...hiddenPreserve, ...tail]);
}
