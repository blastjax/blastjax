"use client";

import { useCallback, useState } from "react";
import {
  type CurrencySettingsState,
  type SubcurrencyEntry,
  loadCurrencySettings,
  saveCurrencySettings,
} from "@/lib/currencySettings";
import { btnPrimary, btnSecondary, fieldLabelText, inputClass } from "@/lib/ui";

function emptySub(): SubcurrencyEntry {
  return { code: "", rateToMain: 1 };
}

export function CurrencySettings() {
  const [draft, setDraft] = useState<CurrencySettingsState>(() =>
    loadCurrencySettings(),
  );
  const [saved, setSaved] = useState(false);

  const persist = useCallback((next: CurrencySettingsState) => {
    saveCurrencySettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Set your <strong className="font-medium text-zinc-800 dark:text-zinc-200">main</strong>{" "}
        display currency (symbol + code). Amounts in that currency show like{" "}
        <span className="whitespace-nowrap">₱ 100.00</span>. Add{" "}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">subcurrencies</strong> with
        an exchange rate to main (e.g. 1 USD = 56 PHP → rate{" "}
        <span className="whitespace-nowrap">56</span>): those rows show as{" "}
        <span className="whitespace-nowrap">100.00 USD</span> without the main symbol, and charts /
        budget totals convert into main.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
          <span>Main currency code</span>
          <input
            className={inputClass}
            value={draft.mainCode}
            onChange={(e) =>
              setDraft((d) => ({ ...d, mainCode: e.target.value.toUpperCase() }))
            }
            placeholder="PHP"
            maxLength={12}
            autoComplete="off"
          />
        </label>
        <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
          <span>Symbol (shown before main-currency amounts)</span>
          <input
            className={inputClass}
            value={draft.mainSymbol}
            onChange={(e) => setDraft((d) => ({ ...d, mainSymbol: e.target.value }))}
            placeholder="₱"
            maxLength={8}
            autoComplete="off"
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Subcurrencies
          </h3>
          <button
            type="button"
            className={btnSecondary}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                subcurrencies: [...d.subcurrencies, emptySub()],
              }))
            }
          >
            Add row
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {draft.subcurrencies.length === 0 ? (
            <li className="text-xs text-zinc-500 dark:text-zinc-400">
              No subcurrencies. Add one if you record amounts in another currency code.
            </li>
          ) : (
            draft.subcurrencies.map((row, i) => (
              <li
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900/40"
              >
                <label className={`min-w-[6rem] flex-1 ${fieldLabelText}`}>
                  <span className="text-[10px]">Code</span>
                  <input
                    className={inputClass}
                    value={row.code}
                    onChange={(e) =>
                      setDraft((d) => {
                        const next = [...d.subcurrencies];
                        next[i] = {
                          ...next[i],
                          code: e.target.value.toUpperCase(),
                        };
                        return { ...d, subcurrencies: next };
                      })
                    }
                    placeholder="USD"
                    autoComplete="off"
                  />
                </label>
                <label className={`min-w-[8rem] flex-1 ${fieldLabelText}`}>
                  <span className="text-[10px]">Exchange rate</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={String(row.rateToMain)}
                    onChange={(e) =>
                      setDraft((d) => {
                        const next = [...d.subcurrencies];
                        const n = parseFloat(e.target.value);
                        next[i] = {
                          ...next[i],
                          rateToMain: Number.isFinite(n) ? n : 0,
                        };
                        return { ...d, subcurrencies: next };
                      })
                    }
                    placeholder="56"
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-zinc-300 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      subcurrencies: d.subcurrencies.filter((_, j) => j !== i),
                    }))
                  }
                >
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            const mainCode = draft.mainCode.trim() || "PHP";
            const mainSymbol = draft.mainSymbol.trim() || "₱";
            const subs = draft.subcurrencies
              .map((s) => ({
                code: s.code.trim().toUpperCase(),
                rateToMain: s.rateToMain,
              }))
              .filter(
                (s) =>
                  s.code &&
                  s.code !== mainCode.toUpperCase() &&
                  s.rateToMain > 0,
              );
            persist({ mainCode, mainSymbol, subcurrencies: subs });
            setDraft({ mainCode, mainSymbol, subcurrencies: subs });
          }}
        >
          Save currency settings
        </button>
        {saved ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>
        ) : null}
      </div>
    </div>
  );
}
