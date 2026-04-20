"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import { useTransactionModal } from "@/components/TransactionModalProvider";
import {
  TOGGLABLE_COLUMNS,
  loadUserHiddenColumns,
  setUserHiddenColumns,
  useUserHiddenColumns,
  type TogglableColumn,
} from "@/lib/columnVisibility";
import {
  btnCompactIndigoOutline,
  btnSmallSecondary,
  sectionCard,
} from "@/lib/ui";
import { CurrencySettings } from "./CurrencySettings";
import { RepeatTransactionsSettings } from "./RepeatTransactionsSettings";
import { ThemeToggleSection } from "./ThemeToggleSection";

const LABELS: Record<TogglableColumn, string> = {
  Period: "Period",
  Accounts: "Accounts",
  Category: "Category",
  Subcategory: "Subcategory",
  Note: "Note",
  "Income/Expense": "Income / Expense",
  Description: "Description",
  Amount: "Amount",
  Currency: "Currency",
};

const SECTIONS: { heading: string; columns: readonly TogglableColumn[] }[] = [
  {
    heading: "Date",
    columns: ["Period"],
  },
  {
    heading: "Notes & description",
    columns: ["Note", "Description"],
  },
  {
    heading: "Amounts",
    columns: ["Amount"],
  },
];

export default function SettingsClient() {
  const { openTxCreate, txModalOpen } = useTransactionModal();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const userHidden = useUserHiddenColumns();

  const setColumnShown = (column: TogglableColumn, shown: boolean) => {
    const next = loadUserHiddenColumns();
    if (shown) next.delete(column);
    else next.add(column);
    setUserHiddenColumns(next);
  };

  const showAllColumns = () => {
    setUserHiddenColumns(new Set());
  };

  const hideAllPickable = () => {
    setUserHiddenColumns(new Set(TOGGLABLE_COLUMNS));
  };

  return (
    <div className="relative mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-28 py-8 sm:px-6">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Settings
        </h1>
      </header>

      <section className={sectionCard}>
        <ThemeToggleSection />
      </section>

      <section className={sectionCard}>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Currency display &amp; conversion
        </h2>
        <div className="mt-4">
          <CurrencySettings />
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Repeat transactions
        </h2>
        <RepeatTransactionsSettings />
      </section>

      <section className={sectionCard}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Which columns to show
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnCompactIndigoOutline}
              onClick={showAllColumns}
            >
              Show all
            </button>
            <button
              type="button"
              className={btnSmallSecondary}
              onClick={hideAllPickable}
            >
              Hide all
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                {section.heading}
              </h3>
              <ul className="flex flex-col gap-3">
                {section.columns.map((col) => {
                  const shown = !userHidden.has(col);
                  const id = `show-col-${col.replace(/[^a-zA-Z0-9]/g, "-")}`;
                  return (
                    <li key={col}>
                      <label
                        htmlFor={id}
                        className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition sm:items-start ${
                          shown
                            ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/60 dark:bg-indigo-950/20"
                            : "border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40"
                        } ${!hydrated ? "pointer-events-none opacity-60" : ""}`}
                      >
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-900"
                          checked={shown}
                          disabled={!hydrated}
                          onChange={(e) => setColumnShown(col, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {LABELS[col]}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-zinc-800 dark:text-zinc-200">
        <Link
          href="/"
          className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Calendar
        </Link>
        {" · "}
        <Link
          href="/summary"
          className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Summary
        </Link>
      </p>
      <FloatingAddButton
        hidden={txModalOpen}
        onClick={() => openTxCreate()}
        ariaLabel="Add transaction"
      />
    </div>
  );
}
