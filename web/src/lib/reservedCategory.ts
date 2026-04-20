/** Workbook column names that must not appear as category labels in UI. */
const RESERVED_CATEGORY_LOWER = new Set(["accounts"]);

export function isReservedCategoryLabel(name: string | null | undefined): boolean {
  if (name == null || name === "") return false;
  return RESERVED_CATEGORY_LOWER.has(name.trim().toLowerCase());
}
