"use client";

import { useState } from "react";
import { ChartColorsSettingsPanel } from "./ChartColorsSettingsPanel";
import { PayslipDefaultsPanel } from "./PayslipDefaultsPanel";

type SettingsTab = "payslip" | "charts";

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("payslip");

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Settings
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Browser-only preferences for payslip defaults and salary chart colors.
            </p>
          </div>
          <div
            className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/50"
            role="tablist"
            aria-label="Settings sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "payslip"}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === "payslip"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              onClick={() => setTab("payslip")}
            >
              Payslip
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "charts"}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === "charts"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              onClick={() => setTab("charts")}
            >
              Charts
            </button>
          </div>
        </div>
      </header>

      {tab === "payslip" && <PayslipDefaultsPanel />}
      {tab === "charts" && <ChartColorsSettingsPanel />}
    </div>
  );
}
