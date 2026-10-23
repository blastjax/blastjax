"use client";

import { CompanyRedirect } from "@/components/CompanyRedirect";

export default function PayslipRedirectPage() {
  return (
    <CompanyRedirect
      basePath="/payslip"
      emptyMessage="Add a company under Settings → Companies to see its payslips."
    />
  );
}
