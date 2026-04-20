/** localStorage key for light / dark preference. */
export const BUDGET_THEME_STORAGE_KEY = "budget-theme";

export type BudgetTheme = "light" | "dark";

export function readStoredTheme(): BudgetTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(BUDGET_THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredTheme(theme: BudgetTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BUDGET_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveInitialTheme(): BudgetTheme {
  const stored = readStoredTheme();
  if (stored) return stored;
  return getSystemPrefersDark() ? "dark" : "light";
}

export function applyThemeToDocument(theme: BudgetTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
