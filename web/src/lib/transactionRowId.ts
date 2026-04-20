/** `id` on analyze / calendar transaction preview rows (PostgreSQL budget_data id). */
export function getTransactionRowId(
  row: Record<string, unknown>,
): number | null {
  const rawId = row.id;
  const numId =
    typeof rawId === "number"
      ? rawId
      : typeof rawId === "string"
        ? parseInt(rawId, 10)
        : NaN;
  return Number.isFinite(numId) ? numId : null;
}
