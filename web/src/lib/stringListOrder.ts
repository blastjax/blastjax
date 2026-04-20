/**
 * Apply a preferred order: known entries first (that exist in `fullNames`),
 * then any remaining names sorted alphabetically.
 */
export function applyNameOrder(fullNames: string[], order: string[]): string[] {
  const set = new Set(fullNames);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const o of order) {
    if (set.has(o) && !seen.has(o)) {
      out.push(o);
      seen.add(o);
    }
  }
  const rest = fullNames.filter((n) => !seen.has(n));
  rest.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  out.push(...rest);
  return out;
}
