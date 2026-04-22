import type { CategoryCatalogEntry } from "@/lib/api";

/**
 * True when the category is excluded from pie charts via Settings → Which values
 * (Category) or the category catalog `is_hidden` flag.
 */
export function isCategoryHiddenFromPieCharts(
  categoryName: string,
  hiddenInstanceCategories: string[] | undefined,
  categoryCatalog: CategoryCatalogEntry[] | null,
): boolean {
  if (hiddenInstanceCategories?.includes(categoryName)) return true;
  if (!categoryCatalog?.length) return false;
  for (const c of categoryCatalog) {
    if (c.is_hidden !== true) continue;
    if (
      c.name === categoryName ||
      c.name.localeCompare(categoryName, undefined, {
        sensitivity: "accent",
      }) === 0
    ) {
      return true;
    }
  }
  return false;
}
