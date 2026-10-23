"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks } from "@/components/FinanceUI";
import { getCompanies, type CompanyRow } from "@/lib/api";
import { alertClasses, PAGE_CONTAINER_CLASSES } from "@/lib/ui";

// Sends a per-company page's bare route (/payslip) to its first matching company (/payslip/Acme).
export function CompanyRedirect({
  basePath,
  emptyMessage,
  pick = () => true,
}: {
  basePath: string;
  emptyMessage: string;
  pick?: (company: CompanyRow) => boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    getCompanies()
      .then((r) => {
        const first = r.companies.find(pick)?.name;
        if (first) router.replace(`${basePath}/${encodeURIComponent(first)}`);
        else setEmpty(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load companies."));
    // pick is an inline lambda at every call site; it never changes meaning between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, basePath]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      {error ? (
        <ErrorAlert>{error}</ErrorAlert>
      ) : empty ? (
        <p className={alertClasses("info")}>{emptyMessage}</p>
      ) : (
        <LoadingBlocks label="Loading…" />
      )}
    </div>
  );
}
