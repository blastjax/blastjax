"use client";

import { CompanyRedirect } from "@/components/CompanyRedirect";

export default function CommissionRedirectPage() {
  return (
    <CompanyRedirect
      basePath="/commission"
      pick={(c) => c.show_commission}
      emptyMessage="Turn on Commission for a company under Settings → Companies to see its commission."
    />
  );
}
