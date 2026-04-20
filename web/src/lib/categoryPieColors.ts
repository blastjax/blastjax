/** ROYGBIV order; repeats for more than seven slices (same as pie charts). */
export const CATEGORY_PIE_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#4f46e5", // indigo
  "#7c3aed", // violet
] as const;

export function categoryPieColorAtIndex(index: number): string {
  return CATEGORY_PIE_COLORS[index % CATEGORY_PIE_COLORS.length];
}
