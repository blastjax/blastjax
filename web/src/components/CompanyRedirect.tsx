"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks } from "@/components/FinanceUI";
import { errorMessage, type CompanyRow } from "@/lib/api";
import { queries } from "@/lib/queries";
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
  const { data, error } = useQuery(queries.companies());
  const first = data?.companies.find(pick)?.name;
  const empty = data !== undefined && first === undefined;

  useEffect(() => {
    if (first) router.replace(`${basePath}/${encodeURIComponent(first)}`);
  }, [router, basePath, first]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      {error ? (
        <ErrorAlert>{errorMessage(error, "Failed to load companies.")}</ErrorAlert>
      ) : empty ? (
        <p className={alertClasses("info")}>{emptyMessage}</p>
      ) : (
        <LoadingBlocks label="Loading…" />
      )}
    </div>
  );
}
