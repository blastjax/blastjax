"use client";

import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import {
  PAGE_CONTAINER_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";
import { CompaniesSettingsPanel } from "./CompaniesSettingsPanel";
import { PayslipDefaultsPanel } from "./PayslipDefaultsPanel";
import { UsersSettingsPanel } from "./UsersSettingsPanel";

type SettingsTab = "payslip" | "companies" | "users";

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("payslip");

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Settings"
        description={<>Manage payslip defaults, companies, and users.</>}
        actions={
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
              aria-selected={tab === "companies"}
              className={`${SEGMENTED_BUTTON_CLASSES} ${
                tab === "companies"
                  ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                  : SEGMENTED_BUTTON_INACTIVE_CLASSES
              }`}
              onClick={() => setTab("companies")}
            >
              Companies
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "users"}
              className={`${SEGMENTED_BUTTON_CLASSES} ${
                tab === "users"
                  ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                  : SEGMENTED_BUTTON_INACTIVE_CLASSES
              }`}
              onClick={() => setTab("users")}
            >
              Users
            </button>
          </div>
        }
      />

      {tab === "payslip" && <PayslipDefaultsPanel />}
      {tab === "companies" && <CompaniesSettingsPanel />}
      {tab === "users" && <UsersSettingsPanel />}
    </div>
  );
}
