"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCompanies } from "@/lib/api";
import { LOADING_TEXT_CLASSES, PAGE_CONTAINER_CLASSES } from "@/lib/ui";

/** `/commission` has no company of its own — send visitors to the first
 * company with commission turned on (Settings → Companies decides which one). */
export default function CommissionRedirectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCompanies()
      .then((r) => {
        const first = r.companies.find((c) => c.show_commission)?.name;
        if (first) {
          router.replace(`/commission/${encodeURIComponent(first)}`);
        } else {
          setError("Turn on Commission for a company under Settings → Companies to see its commission.");
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load companies."),
      );
  }, [router]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <p className={error ? "text-sm text-red-700 dark:text-red-400" : LOADING_TEXT_CLASSES}>
        {error ?? "Loading…"}
      </p>
    </div>
  );
}
