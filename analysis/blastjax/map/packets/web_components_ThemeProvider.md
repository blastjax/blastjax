# Node web:components:ThemeProvider: components/ThemeProvider.tsx
Kind: module
Language: typescript, 70 lines of code, location: web/src/components/ThemeProvider.tsx

Source excerpt: web/src/components/ThemeProvider.tsx (first 81 lines)
```
   1  "use client";
   2  
   3  import {
   4    createContext,
   5    useCallback,
   6    useContext,
   7    useEffect,
   8    useLayoutEffect,
   9    useMemo,
  10    useState,
  11    type ReactNode,
  12  } from "react";
  13  import {
  14    applyThemeToDocument,
  15    BUDGET_THEME_STORAGE_KEY,
  16    type BudgetTheme,
  17    resolveInitialTheme,
  18    writeStoredTheme,
  19  } from "@/lib/theme";
  20  
  21  type ThemeContextValue = {
  22    theme: BudgetTheme;
  23    setTheme: (t: BudgetTheme) => void;
  24    toggleTheme: () => void;
  25  };
  26  
  27  const ThemeContext = createContext<ThemeContextValue | null>(null);
  28  
  29  export function ThemeProvider({ children }: { children: ReactNode }) {
  30    const [theme, setThemeState] = useState<BudgetTheme>("light");
  31  
  32    useLayoutEffect(() => {
  33      const next = resolveInitialTheme();
  34      setThemeState(next);
  35      applyThemeToDocument(next);
  36    }, []);
  37  
  38    useEffect(() => {
  39      const onStorage = (e: StorageEvent) => {
  40        if (e.key !== BUDGET_THEME_STORAGE_KEY || e.newValue == null) return;
  41        if (e.newValue === "light" || e.newValue === "dark") {
  42          setThemeState(e.newValue);
  43          applyThemeToDocument(e.newValue);
  44        }
  45      };
  46      window.addEventListener("storage", onStorage);
  47      return () => window.removeEventListener("storage", onStorage);
  48    }, []);
  49  
  50    const setTheme = useCallback((t: BudgetTheme) => {
  51      writeStoredTheme(t);
  52      setThemeState(t);
  53      applyThemeToDocument(t);
  54    }, []);
  55  
  56    const toggleTheme = useCallback(() => {
  57      setThemeState((prev) => {
  58        const next = prev === "dark" ? "light" : "dark";
  59        writeStoredTheme(next);
  60        applyThemeToDocument(next);
  61        return next;
  62      });
  63    }, []);
  64  
  65    const value = useMemo(
  66      () => ({ theme, setTheme, toggleTheme }),
  67      [theme, setTheme, toggleTheme],
  68    );
  69  
  70    return (
  71      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  72    );
  73  }
  74  
  75  export function useTheme(): ThemeContextValue {
  76    const ctx = useContext(ThemeContext);
  77    if (!ctx) {
  78      throw new Error("useTheme must be used within ThemeProvider");
  79    }
  80    return ctx;
  81  }
```

## Outgoing connections
- call -> lib/theme.ts (web:lib:theme)

## Incoming connections
- /blood-pressure (web:blood-pressure) -> call
- components/Header.tsx (web:components:Header) -> call
- layout + error (web:layout) -> call
- /software-architecture (web:software-architecture) -> call
