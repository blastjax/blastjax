"use client";

import { Segmented } from "@/components/FinanceUI";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { PAGE_CONTAINER_CLASSES } from "@/lib/ui";
import { CompaniesSettingsPanel } from "./CompaniesSettingsPanel";
import { PasskeysSettingsPanel } from "./PasskeysSettingsPanel";
import { PayslipDefaultsPanel } from "./PayslipDefaultsPanel";
import { UsersSettingsPanel } from "./UsersSettingsPanel";

type SettingsTab = "payslip" | "companies" | "users" | "passkeys";

const TABS = [
  { value: "payslip", label: "Payslip" },
  { value: "companies", label: "Companies" },
  { value: "users", label: "Users" },
  { value: "passkeys", label: "Passkeys" },
] as const;

export default function SettingsClient() {
  const [tab, setTab] = useState<SettingsTab>("payslip");

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Settings"
        description={<>Manage payslip defaults, companies, users, and your passkeys.</>}
        actions={<Segmented label="Settings sections" options={TABS} value={tab} onChange={setTab} className="shrink-0" />}
      />

      {tab === "payslip" && <PayslipDefaultsPanel />}
      {tab === "companies" && <CompaniesSettingsPanel />}
      {tab === "users" && <UsersSettingsPanel />}
      {tab === "passkeys" && <PasskeysSettingsPanel />}
    </div>
  );
}
