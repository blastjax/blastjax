"use client";

import { useState } from "react";
import {
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";
import { ChartColorsSettingsPanel } from "./ChartColorsSettingsPanel";
import { CloudSyncPanel } from "./CloudSyncPanel";
import { PayslipDefaultsPanel } from "./PayslipDefaultsPanel";

type SettingsTab = "payslip" | "charts";

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("payslip");

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Settings
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Manage payslip defaults, chart colors, and cloud sync.
            </p>
          </div>
          <div
            className={`shrink-0 ${SEGMENTED_WRAPPER_CLASSES}`}
            role="tablist"
            aria-label="Settings sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "payslip"}
              className={`${SEGMENTED_BUTTON_CLASSES} ${
                tab === "payslip"
                  ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                  : SEGMENTED_BUTTON_INACTIVE_CLASSES
              }`}
              onClick={() => setTab("payslip")}
            >
              Payslip
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "charts"}
              className={`${SEGMENTED_BUTTON_CLASSES} ${
                tab === "charts"
                  ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                  : SEGMENTED_BUTTON_INACTIVE_CLASSES
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

      <CloudSyncPanel />
    </div>
  );
}
