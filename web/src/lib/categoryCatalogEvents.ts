/** Fired after category catalog mutations so data previews can refetch nin filters. */
export const CATEGORY_CATALOG_CHANGED_EVENT = "budgetapp:category-catalog-changed";

export function dispatchCategoryCatalogChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CATEGORY_CATALOG_CHANGED_EVENT));
}
