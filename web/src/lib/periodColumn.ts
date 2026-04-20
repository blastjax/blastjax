import type { ColumnMeta } from "@/lib/api";

/** Prefer `Period`, else first datetime column present in the row set. */
export function resolvePeriodColumnName(
  columnNames: string[],
  columnMetas?: ColumnMeta[],
): string | null {
  if (columnNames.includes("Period")) return "Period";
  if (columnMetas?.length) {
    const dt = columnMetas.find(
      (m) => columnNames.includes(m.name) && m.kind === "datetime",
    );
    if (dt) return dt.name;
  }
  return null;
}

/** When only name → kind map is available (e.g. account drill). */
export function resolvePeriodColumnNameFromKinds(
  columnNames: string[],
  kindByName: Record<string, string>,
): string | null {
  if (columnNames.includes("Period")) return "Period";
  const dt = columnNames.find((c) => kindByName[c] === "datetime");
  return dt ?? null;
}
