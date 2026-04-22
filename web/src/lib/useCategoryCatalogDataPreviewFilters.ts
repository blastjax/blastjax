"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyzeBody } from "@/lib/api";
import { getCategoryCatalog, type CategoryCatalogEntry } from "@/lib/api";
import { CATEGORY_CATALOG_CHANGED_EVENT } from "@/lib/categoryCatalogEvents";
import { isReservedCategoryLabel } from "@/lib/reservedCategory";

/** `nin` filter for rows whose Category is marked hidden-from-preview in the catalog. */
export function categoryCatalogDataPreviewNinFilters(
  categories: CategoryCatalogEntry[] | null,
): NonNullable<AnalyzeBody["filters"]> {
  if (!categories?.length) return [];
  const names = categories
    .filter(
      (c) =>
        c.hide_from_data_preview === true &&
        !isReservedCategoryLabel(c.name),
    )
    .map((c) => c.name.trim())
    .filter((n) => n.length > 0);
  if (!names.length) return [];
  return [{ column: "Category", op: "nin", value: names }];
}

export function useCategoryCatalogDataPreviewFilters(): NonNullable<
  AnalyzeBody["filters"]
> {
  const [categories, setCategories] = useState<CategoryCatalogEntry[] | null>(
    null,
  );
  const load = useCallback(async () => {
    try {
      const r = await getCategoryCatalog();
      setCategories(r.categories);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(CATEGORY_CATALOG_CHANGED_EVENT, on);
    return () => window.removeEventListener(CATEGORY_CATALOG_CHANGED_EVENT, on);
  }, [load]);

  return useMemo(
    () => categoryCatalogDataPreviewNinFilters(categories),
    [categories],
  );
}
