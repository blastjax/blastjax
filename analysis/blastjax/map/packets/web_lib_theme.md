# Node web:lib:theme: lib/theme.ts
Kind: module
Language: typescript, 37 lines of code, location: web/src/lib/theme.ts

Source excerpt: web/src/lib/theme.ts (first 44 lines)
```
   1  export const BUDGET_THEME_STORAGE_KEY = "budget-theme";
   2  
   3  export type BudgetTheme = "light" | "dark";
   4  
   5  export function readStoredTheme(): BudgetTheme | null {
   6    if (typeof window === "undefined") return null;
   7    try {
   8      const v = localStorage.getItem(BUDGET_THEME_STORAGE_KEY);
   9      if (v === "light" || v === "dark") return v;
  10    } catch {
  11    }
  12    return null;
  13  }
  14  
  15  export function writeStoredTheme(theme: BudgetTheme): void {
  16    if (typeof window === "undefined") return;
  17    try {
  18      localStorage.setItem(BUDGET_THEME_STORAGE_KEY, theme);
  19    } catch {
  20    }
  21  }
  22  
  23  export function getSystemPrefersDark(): boolean {
  24    if (typeof window === "undefined") return false;
  25    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  26  }
  27  
  28  export function resolveInitialTheme(): BudgetTheme {
  29    const stored = readStoredTheme();
  30    if (stored) return stored;
  31    return getSystemPrefersDark() ? "dark" : "light";
  32  }
  33  
  34  export const THEME_COLOR: Record<BudgetTheme, string> = {
  35    light: "#fafafa",
  36    dark: "#0b0b0c",
  37  };
  38  
  39  export function applyThemeToDocument(theme: BudgetTheme): void {
  40    document.documentElement.classList.toggle("dark", theme === "dark");
  41    document
  42      .querySelectorAll('meta[name="theme-color"]')
  43      .forEach((el) => el.setAttribute("content", THEME_COLOR[theme]));
  44  }
```

## Outgoing connections
- none

## Incoming connections
- components/ThemeInitScript.tsx (web:components:ThemeInitScript) -> call
- components/ThemeProvider.tsx (web:components:ThemeProvider) -> call
- layout + error (web:layout) -> call
- /software-architecture (web:software-architecture) -> call
