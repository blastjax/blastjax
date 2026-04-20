"use client";

import { getUserPreferences, saveUserPreferences } from "@/lib/api";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";

/** Dispatched after server prefs are written to localStorage so hooks re-read. */
export const PREFS_APPLIED_EVENT = "budgetapp-prefs-applied";

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrateLock = false;

function dispatchPrefsApplied() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PREFS_APPLIED_EVENT));
}

function safeParseJson(raw: string | null): unknown {
  if (raw == null || raw === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Current UI state for PUT /api/user-preferences (mirrors localStorage). */
export function collectUserPreferencesPayload(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const k = USER_PREF_LS_KEYS;
  const col = safeParseJson(localStorage.getItem(k.columnVisibility));
  const val = safeParseJson(localStorage.getItem(k.valueInstances));
  const bal = safeParseJson(localStorage.getItem(k.balanceSidebarAccounts));
  const totalEx = safeParseJson(localStorage.getItem(k.balanceSidebarTotalExcluded));
  const ord = safeParseJson(localStorage.getItem(k.accountOrder));
  const manual = safeParseJson(localStorage.getItem(k.manualAccounts));
  const del = safeParseJson(localStorage.getItem(k.deletedAccounts));
  const txPick = safeParseJson(localStorage.getItem(k.txModalPickerOrder));
  const txModalPickerOrder =
    txPick != null && typeof txPick === "object" && !Array.isArray(txPick)
      ? txPick
      : { categories: [], subcategories: {} };
  const cur = safeParseJson(localStorage.getItem(k.currencySettings));
  const currencySettings =
    cur != null && typeof cur === "object" && !Array.isArray(cur) ? cur : {};
  const subH = safeParseJson(localStorage.getItem(k.accountsSubcurrencyHidden));
  const accountsSubcurrencyHidden = Array.isArray(subH) ? subH : [];
  return {
    columnVisibility: Array.isArray(col) ? col : [],
    valueInstances:
      val != null && typeof val === "object" && !Array.isArray(val)
        ? val
        : {},
    balanceSidebarAccounts: Array.isArray(bal) ? bal : [],
    balanceSidebarTotalExcluded: Array.isArray(totalEx) ? totalEx : [],
    accountOrder: Array.isArray(ord) ? ord : [],
    manualAccounts: Array.isArray(manual) ? manual : [],
    deletedAccounts: Array.isArray(del) ? del : [],
    txModalPickerOrder,
    currencySettings,
    accountsSubcurrencyHidden,
  };
}

export function applyUserPreferencesFromServer(data: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const k = USER_PREF_LS_KEYS;
  hydrateLock = true;
  try {
    if ("columnVisibility" in data && data.columnVisibility != null) {
      localStorage.setItem(
        k.columnVisibility,
        JSON.stringify(data.columnVisibility),
      );
    }
    if ("valueInstances" in data && data.valueInstances != null) {
      localStorage.setItem(
        k.valueInstances,
        JSON.stringify(data.valueInstances),
      );
    }
    if ("balanceSidebarAccounts" in data && data.balanceSidebarAccounts != null) {
      localStorage.setItem(
        k.balanceSidebarAccounts,
        JSON.stringify(data.balanceSidebarAccounts),
      );
    }
    if (
      "balanceSidebarTotalExcluded" in data &&
      data.balanceSidebarTotalExcluded != null
    ) {
      localStorage.setItem(
        k.balanceSidebarTotalExcluded,
        JSON.stringify(data.balanceSidebarTotalExcluded),
      );
    }
    if ("accountOrder" in data && data.accountOrder != null) {
      localStorage.setItem(
        k.accountOrder,
        JSON.stringify(data.accountOrder),
      );
    }
    if ("manualAccounts" in data && data.manualAccounts != null) {
      localStorage.setItem(
        k.manualAccounts,
        JSON.stringify(data.manualAccounts),
      );
    }
    if ("deletedAccounts" in data && data.deletedAccounts != null) {
      localStorage.setItem(
        k.deletedAccounts,
        JSON.stringify(data.deletedAccounts),
      );
    }
    if ("txModalPickerOrder" in data && data.txModalPickerOrder != null) {
      localStorage.setItem(
        k.txModalPickerOrder,
        JSON.stringify(data.txModalPickerOrder),
      );
    }
    if ("currencySettings" in data && data.currencySettings != null) {
      localStorage.setItem(
        k.currencySettings,
        JSON.stringify(data.currencySettings),
      );
    }
    if (
      "accountsSubcurrencyHidden" in data &&
      data.accountsSubcurrencyHidden != null
    ) {
      localStorage.setItem(
        k.accountsSubcurrencyHidden,
        JSON.stringify(data.accountsSubcurrencyHidden),
      );
    }
  } finally {
    hydrateLock = false;
    dispatchPrefsApplied();
  }
}

export async function hydrateUserPreferencesFromApi(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data } = await getUserPreferences();
    if (!data || typeof data !== "object") return;
    const d = data as Record<string, unknown>;
    if (Object.keys(d).length === 0) {
      schedulePersistUserPreferences();
      return;
    }
    applyUserPreferencesFromServer(d);
  } catch {
    /* offline or 503 */
  }
}

async function flushPersistUserPreferences() {
  if (hydrateLock) return;
  try {
    await saveUserPreferences(collectUserPreferencesPayload());
  } catch {
    /* offline */
  }
}

/** Debounced save after any preference change (localStorage already updated). */
export function schedulePersistUserPreferences() {
  if (typeof window === "undefined" || hydrateLock) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersistUserPreferences();
  }, 450);
}
