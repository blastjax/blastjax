"use client";

import { CompanyRedirect } from "@/components/CompanyRedirect";

export default function SalaryStatsRedirectPage() {
  return (
    <CompanyRedirect
      basePath="/salary-stats"
      emptyMessage="Add a company under Settings → Companies to see its stats."
    />
  );
}
