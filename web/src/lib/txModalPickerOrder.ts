"use client";

import { useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

const STORAGE_KEY = USER_PREF_LS_KEYS.txModalPickerOrder;

export type TxModalPickerOrderBlob = {
  categories: string[];
  /** Lowercased category name → ordered subcategory names */
  subcategories: Record<string, string[]>;
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function emptyBlob(): TxModalPickerOrderBlob {
  return { categories: [], subcategories: {} };
}

function parseBlob(raw: string | null): TxModalPickerOrderBlob {
  if (!raw) return emptyBlob();
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return emptyBlob();
    }
    const o = data as Record<string, unknown>;
    const cats = o.categories;
    const subs = o.subcategories;
    const categories = Array.isArray(cats)
      ? cats.map(String)
      : [];
    const subcategories: Record<string, string[]> = {};
    if (subs != null && typeof subs === "object" && !Array.isArray(subs)) {
      for (const [k, v] of Object.entries(subs)) {
        if (Array.isArray(v)) subcategories[k] = v.map(String);
      }
    }
    return { categories, subcategories };
  } catch {
    return emptyBlob();
  }
}

export function getTxModalPickerOrderSerialized(): string {
  if (typeof window === "undefined") return "{}";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function getTxModalPickerOrder(): TxModalPickerOrderBlob {
  return parseBlob(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );
}

export function setTxModalPickerOrder(next: TxModalPickerOrderBlob) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
  schedulePersistUserPreferences();
}

export function setTxModalCategoryOrder(categories: string[]) {
  const cur = getTxModalPickerOrder();
  setTxModalPickerOrder({ ...cur, categories });
}

export function setTxModalSubcategoryOrderForCategory(
  categoryKeyLower: string,
  names: string[],
) {
  const cur = getTxModalPickerOrder();
  setTxModalPickerOrder({
    ...cur,
    subcategories: { ...cur.subcategories, [categoryKeyLower]: names },
  });
}

export function subscribeTxModalPickerOrder(onChange: () => void) {
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

export function useTxModalPickerOrder(): TxModalPickerOrderBlob {
  const raw = useSyncExternalStore(
    subscribeTxModalPickerOrder,
    getTxModalPickerOrderSerialized,
    () => "{}",
  );
  return useMemo(() => parseBlob(raw), [raw]);
}
