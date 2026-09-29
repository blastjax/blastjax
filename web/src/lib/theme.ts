export const BUDGET_THEME_STORAGE_KEY = "budget-theme";

export type BudgetTheme = "light" | "dark";

export function readStoredTheme(): BudgetTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(BUDGET_THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
  }
  return null;
}

export function writeStoredTheme(theme: BudgetTheme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BUDGET_THEME_STORAGE_KEY, theme);
  } catch {
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

export const THEME_COLOR: Record<BudgetTheme, string> = {
  light: "#fafafa",
  dark: "#0b0b0c",
};

export function applyThemeToDocument(theme: BudgetTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", THEME_COLOR[theme]));
}
