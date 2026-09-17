"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanies } from "@/lib/api";
import { LOADING_TEXT_CLASSES, PAGE_CONTAINER_CLASSES } from "@/lib/ui";

/** `/commission` has no company of its own — send visitors to the first
 * company's Commission page (Settings → Companies decides which one). */
export default function CommissionRedirectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCompanies()
      .then((r) => {
        const first = r.companies[0]?.name;
        if (first) {
          router.replace(`/commission/${encodeURIComponent(first)}`);
        } else {
          setError("Add a company under Settings → Companies to see its commission.");
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load companies."),
      );
  }, [router]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <p className={error ? "text-sm text-danger-text" : LOADING_TEXT_CLASSES}>
        {error ?? "Loading…"}
      </p>
    </div>
  );
}
