"use client";

import { Segmented } from "@/components/FinanceUI";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { PAGE_CONTAINER_CLASSES } from "@/lib/ui";
import { CompaniesSettingsPanel } from "./CompaniesSettingsPanel";
import { PayslipDefaultsPanel } from "./PayslipDefaultsPanel";
import { UsersSettingsPanel } from "./UsersSettingsPanel";

type SettingsTab = "payslip" | "companies" | "users";

const TABS = [
  { value: "payslip", label: "Payslip" },
  { value: "companies", label: "Companies" },
  { value: "users", label: "Users" },
] as const;

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("payslip");

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Settings"
        description={<>Manage payslip defaults, companies, and users.</>}
        actions={<Segmented label="Settings sections" options={TABS} value={tab} onChange={setTab} className="shrink-0" />}
      />

      {tab === "payslip" && <PayslipDefaultsPanel />}
      {tab === "companies" && <CompaniesSettingsPanel />}
      {tab === "users" && <UsersSettingsPanel />}
    </div>
  );
}
