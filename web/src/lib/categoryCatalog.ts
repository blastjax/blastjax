import type {
  CategoryCatalogEntry,
  CategoryCatalogKind,
} from "./api";

/** Subcategory names for a catalog category (sorted). Empty if category is blank or not found. */
export function subcategoryNamesForCategory(
  categories: CategoryCatalogEntry[],
  categoryName: string,
): string[] {
  const q = categoryName.trim().toLowerCase();
  if (!q) return [];
  const entry = categories.find(
    (c) => c.name.trim().toLowerCase() === q,
  );
  if (!entry) return [];
  return [...entry.subcategories.map((s) => s.name)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** Categories page tab: expense vs income lists (mixed appears in both). */
export function categoryMatchesCatalogTab(
  kind: CategoryCatalogKind | undefined,
  tab: "expense" | "income",
): boolean {
  const k = kind ?? "expense";
  return k === "mixed" || k === tab;
}

/**
 * Which catalog rows to offer in add/edit transaction pickers for a transaction kind.
 * Transfers show the full catalog so labels stay flexible.
 */
export function catalogCategoriesForTransactionKind(
  categories: CategoryCatalogEntry[],
  txKind: "expense" | "income" | "transfer",
): CategoryCatalogEntry[] {
  if (txKind === "transfer") return categories;
  return categories.filter((c) =>
    categoryMatchesCatalogTab(c.kind, txKind === "income" ? "income" : "expense"),
  );
}

/** Infer dashboard / modal `kind` from Income/Expense cell text. */
export function txKindFromIncomeExpenseCell(raw: string): "expense" | "income" | "transfer" {
  const t = raw.trim().toLowerCase();
  if (t === "transfer-in" || t === "transfer-out" || t.startsWith("transfer")) {
    return "transfer";
  }
  if (t === "income") return "income";
  return "expense";
}
