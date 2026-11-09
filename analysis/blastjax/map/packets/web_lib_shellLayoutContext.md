# Node web:lib:shellLayoutContext: lib/shellLayoutContext.tsx
Kind: module
Language: typescript, 91 lines of code, location: web/src/lib/shellLayoutContext.tsx

Source excerpt: web/src/lib/shellLayoutContext.tsx (first 106 lines)
```
   1  "use client";
   2  
   3  import {
   4    createContext,
   5    useCallback,
   6    useContext,
   7    useEffect,
   8    useMemo,
   9    useState,
  10    type Dispatch,
  11    type ReactNode,
  12    type SetStateAction,
  13  } from "react";
  14  
  15  const LS_SIDEBAR_COLLAPSED = "blastjax:shell:sidebarCollapsed";
  16  
  17  function readBool(key: string, fallback: boolean): boolean {
  18    if (typeof window === "undefined") return fallback;
  19    try {
  20      const raw = localStorage.getItem(key);
  21      if (raw === "1" || raw === "true") return true;
  22      if (raw === "0" || raw === "false") return false;
  23    } catch {
  24    }
  25    return fallback;
  26  }
  27  
  28  type ShellLayoutValue = {
  29    sidebarCollapsed: boolean;
  30    toggleSidebar: () => void;
  31    mobileNavOpen: boolean;
  32    setMobileNavOpen: Dispatch<SetStateAction<boolean>>;
  33    closeMobileNav: () => void;
  34  };
  35  
  36  const ShellLayoutContext = createContext<ShellLayoutValue | null>(null);
  37  
  38  export function ShellLayoutProvider({ children }: { children: ReactNode }) {
  39    const [hydrated, setHydrated] = useState(false);
  40    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  41    const [mobileNavOpen, setMobileNavOpen] = useState(false);
  42  
  43    useEffect(() => {
  44      setSidebarCollapsed(readBool(LS_SIDEBAR_COLLAPSED, false));
  45      setHydrated(true);
  46    }, []);
  47  
  48    useEffect(() => {
  49      if (!hydrated) return;
  50      try {
  51        localStorage.setItem(LS_SIDEBAR_COLLAPSED, sidebarCollapsed ? "1" : "0");
  52      } catch {
  53      }
  54    }, [hydrated, sidebarCollapsed]);
  55  
  56    const toggleSidebar = useCallback(() => {
  57      setSidebarCollapsed((v) => !v);
  58    }, []);
  59  
  60    const closeMobileNav = useCallback(() => {
  61      setMobileNavOpen(false);
  62    }, []);
  63  
  64    useEffect(() => {
  65      const mq = window.matchMedia("(min-width: 1024px)");
  66      const onChange = () => {
  67        if (mq.matches) setMobileNavOpen(false);
  68      };
  69      mq.addEventListener("change", onChange);
  70      return () => mq.removeEventListener("change", onChange);
  71    }, []);
  72  
  73    useEffect(() => {
  74      if (!mobileNavOpen) return;
  75      const prev = document.body.style.overflow;
  76      document.body.style.overflow = "hidden";
  77      return () => {
  78        document.body.style.overflow = prev;
  79      };
  80    }, [mobileNavOpen]);
  81  
  82    const value = useMemo(
  83      (): ShellLayoutValue => ({
  84        sidebarCollapsed,
  85        toggleSidebar,
  86        mobileNavOpen,
  87        setMobileNavOpen,
  88        closeMobileNav,
  89      }),
  90      [sidebarCollapsed, toggleSidebar, mobileNavOpen, closeMobileNav],
  91    );
  92  
  93    return (
  94      <ShellLayoutContext.Provider value={value}>
  95        {children}
  96      </ShellLayoutContext.Provider>
  97    );
  98  }
  99  
 100  export function useShellLayout(): ShellLayoutValue {
 101    const ctx = useContext(ShellLayoutContext);
 102    if (!ctx) {
 103      throw new Error("useShellLayout must be used within ShellLayoutProvider");
 104    }
 105    return ctx;
 106  }
```

## Outgoing connections
- none

## Incoming connections
- components/AppShell.tsx (web:components:AppShell) -> call
- components/Header.tsx (web:components:Header) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
