"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

const LS_SIDEBAR_COLLAPSED = "blastjax:shell:sidebarCollapsed";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch {
  }
  return fallback;
}

type ShellLayoutValue = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: Dispatch<SetStateAction<boolean>>;
  closeMobileNav: () => void;
};

const ShellLayoutContext = createContext<ShellLayoutValue | null>(null);

export function ShellLayoutProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(readBool(LS_SIDEBAR_COLLAPSED, false));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_SIDEBAR_COLLAPSED, sidebarCollapsed ? "1" : "0");
    } catch {
    }
  }, [hydrated, sidebarCollapsed]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => !v);
  }, []);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const value = useMemo(
    (): ShellLayoutValue => ({
      sidebarCollapsed,
      toggleSidebar,
      mobileNavOpen,
      setMobileNavOpen,
      closeMobileNav,
    }),
    [sidebarCollapsed, toggleSidebar, mobileNavOpen, closeMobileNav],
  );

  return (
    <ShellLayoutContext.Provider value={value}>
      {children}
    </ShellLayoutContext.Provider>
  );
}

export function useShellLayout(): ShellLayoutValue {
  const ctx = useContext(ShellLayoutContext);
  if (!ctx) {
    throw new Error("useShellLayout must be used within ShellLayoutProvider");
  }
  return ctx;
}
