"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USER_PREF_LS_KEYS } from "@/lib/userPreferenceStorageKeys";
import {
  PREFS_APPLIED_EVENT,
  schedulePersistUserPreferences,
} from "@/lib/userPreferencesPersistence";

export type SubcurrencyEntry = {
  /** ISO-like code, e.g. USD */
  code: string;
  /** Units of main currency for 1 unit of this code (e.g. 1 USD = 56 PHP → 56). */
  rateToMain: number;
};

export type CurrencySettingsState = {
  mainCode: string;
  mainSymbol: string;
  subcurrencies: SubcurrencyEntry[];
};

const STORAGE_KEY = USER_PREF_LS_KEYS.currencySettings;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettingsState = {
  mainCode: "PHP",
  mainSymbol: "₱",
  subcurrencies: [],
};

function parseState(raw: string | null): CurrencySettingsState {
  if (!raw) return { ...DEFAULT_CURRENCY_SETTINGS };
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ...DEFAULT_CURRENCY_SETTINGS };
    }
    const o = data as Record<string, unknown>;
    const mainCode =
      typeof o.mainCode === "string" ? o.mainCode.trim() : DEFAULT_CURRENCY_SETTINGS.mainCode;
    const mainSymbol =
      typeof o.mainSymbol === "string"
        ? o.mainSymbol
        : DEFAULT_CURRENCY_SETTINGS.mainSymbol;
    const subsRaw = o.subcurrencies;
    const subcurrencies: SubcurrencyEntry[] = [];
    if (Array.isArray(subsRaw)) {
      for (const s of subsRaw) {
        if (!s || typeof s !== "object") continue;
        const sc = s as Record<string, unknown>;
        const code = typeof sc.code === "string" ? sc.code.trim() : "";
        const rate = typeof sc.rateToMain === "number" ? sc.rateToMain : Number(sc.rateToMain);
        if (!code || !Number.isFinite(rate) || rate <= 0) continue;
        subcurrencies.push({ code, rateToMain: rate });
      }
    }
    return {
      mainCode: mainCode || DEFAULT_CURRENCY_SETTINGS.mainCode,
      mainSymbol: mainSymbol || DEFAULT_CURRENCY_SETTINGS.mainSymbol,
      subcurrencies,
    };
  } catch {
    return { ...DEFAULT_CURRENCY_SETTINGS };
  }
}

export function loadCurrencySettings(): CurrencySettingsState {
  if (typeof window === "undefined") return { ...DEFAULT_CURRENCY_SETTINGS };
  return parseState(localStorage.getItem(STORAGE_KEY));
}

export function saveCurrencySettings(next: CurrencySettingsState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
  schedulePersistUserPreferences();
}

export function getCurrencySettingsSerialized(): string {
  if (typeof window === "undefined") return "{}";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function subscribeCurrencySettings(onChange: () => void) {
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

export function useCurrencySettings(): CurrencySettingsState {
  const serialized = useSyncExternalStore(
    subscribeCurrencySettings,
    getCurrencySettingsSerialized,
    () => "{}",
  );
  return useMemo(() => parseState(serialized), [serialized]);
}

export function normalizeCurrencyCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase();
}

/** API payload for backend conversion (amount_sub × rate = amount_main). */
export function buildCurrencyConversionPayload(
  s: CurrencySettingsState,
): { main_code: string; sub_rates: Record<string, number> } | undefined {
  const main = normalizeCurrencyCode(s.mainCode);
  if (!main) return undefined;
  const sub_rates: Record<string, number> = {};
  for (const sub of s.subcurrencies) {
    const c = normalizeCurrencyCode(sub.code);
    if (!c || c === main) continue;
    if (Number.isFinite(sub.rateToMain) && sub.rateToMain > 0) {
      sub_rates[c] = sub.rateToMain;
    }
  }
  return { main_code: main, sub_rates };
}

function rateForRow(
  currencyCell: string,
  settings: CurrencySettingsState,
): number {
  const main = normalizeCurrencyCode(settings.mainCode);
  const cur = normalizeCurrencyCode(currencyCell);
  if (!cur || cur === main) return 1;
  const hit = settings.subcurrencies.find(
    (x) => normalizeCurrencyCode(x.code) === cur,
  );
  if (hit && Number.isFinite(hit.rateToMain) && hit.rateToMain > 0) {
    return hit.rateToMain;
  }
  return 1;
}

export function amountInMainCurrency(
  amount: number,
  currencyCell: string | null | undefined,
  settings: CurrencySettingsState,
): number {
  return amount * rateForRow(String(currencyCell ?? ""), settings);
}

/**
 * Data preview: main currency → "₱ 100.00"; subcurrency → "100.00 USD" (no main symbol).
 */
export function formatPreviewAmountDisplay(
  amount: number,
  row: Record<string, unknown>,
  settings: CurrencySettingsState,
): string {
  if (!Number.isFinite(amount)) return "";
  const curRaw = row.Currency ?? row.currency;
  const cur = normalizeCurrencyCode(
    curRaw != null && curRaw !== "" ? String(curRaw) : "",
  );
  const main = normalizeCurrencyCode(settings.mainCode);
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? "-" : "";
  if (!cur || cur === main) {
    const sym = settings.mainSymbol.trim() || main;
    return `${sign}${sym} ${formatted}`.trim();
  }
  const isSub = settings.subcurrencies.some(
    (s) => normalizeCurrencyCode(s.code) === cur,
  );
  if (isSub) {
    return `${sign}${formatted} ${cur}`.trim();
  }
  return `${sign}${formatted} ${cur}`.trim();
}

/** Totals / sidebar: values already in main currency — show with main symbol. */
export function formatMainCurrencyTotal(
  amount: number | null | undefined,
  settings: CurrencySettingsState,
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  const sym = settings.mainSymbol.trim() || normalizeCurrencyCode(settings.mainCode);
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? "-" : "";
  return `${sign}${sym} ${formatted}`.trim();
}

export function useFormatMainTotal() {
  const settings = useCurrencySettings();
  return useCallback(
    (amount: number | null | undefined) => formatMainCurrencyTotal(amount, settings),
    [settings],
  );
}
