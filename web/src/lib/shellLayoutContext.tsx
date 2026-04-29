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

const LS_LEFT_COLLAPSED = "budgetapp:shell:leftCollapsed";
const LS_LEFT_WIDTH = "budgetapp:shell:leftWidth";
const LS_RIGHT_COLLAPSED = "budgetapp:shell:rightCollapsed";
const LS_RIGHT_WIDTH = "budgetapp:shell:rightWidth";

export const LEFT_MIN = 160;
export const LEFT_MAX = 420;
export const LEFT_DEFAULT = 208;

export const RIGHT_MIN = 180;
export const RIGHT_MAX = 560;
export const RIGHT_DEFAULT = 224;

/** Width when a panel is minimized to a rail (toggle only). */
export const RAIL_WIDTH = 44;

function readNum(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

type ShellLayoutValue = {
  leftCollapsed: boolean;
  leftWidth: number;
  rightCollapsed: boolean;
  rightWidth: number;
  setLeftCollapsed: (v: boolean) => void;
  setRightCollapsed: (v: boolean) => void;
  setLeftWidth: (v: number) => void;
  setRightWidth: (v: number) => void;
  /** Collapse nav rail ⟷ expanded (width from drag or last saved). */
  toggleLeft: () => void;
  /** Collapse balances rail ⟷ expanded. */
  toggleRight: () => void;
  maximizeLeft: () => void;
  maximizeRight: () => void;
  /** Slide-over navigation (viewports below `lg` only). */
  mobileNavOpen: boolean;
  setMobileNavOpen: Dispatch<SetStateAction<boolean>>;
  closeMobileNav: () => void;
  /** Slide-over account balances (viewports below `lg` only). */
  mobileBalancesOpen: boolean;
  setMobileBalancesOpen: Dispatch<SetStateAction<boolean>>;
  closeMobileBalances: () => void;
};

const ShellLayoutContext = createContext<ShellLayoutValue | null>(null);

export function ShellLayoutProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [leftCollapsed, setLeftCollapsedState] = useState(false);
  const [leftWidth, setLeftWidthState] = useState(LEFT_DEFAULT);
  const [rightCollapsed, setRightCollapsedState] = useState(false);
  const [rightWidth, setRightWidthState] = useState(RIGHT_DEFAULT);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileBalancesOpen, setMobileBalancesOpen] = useState(false);

  useEffect(() => {
    setLeftCollapsed(readBool(LS_LEFT_COLLAPSED, false));
    setLeftWidthState(readNum(LS_LEFT_WIDTH, LEFT_DEFAULT, LEFT_MIN, LEFT_MAX));
    setRightCollapsed(readBool(LS_RIGHT_COLLAPSED, false));
    setRightWidthState(readNum(LS_RIGHT_WIDTH, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_LEFT_COLLAPSED, leftCollapsed ? "1" : "0");
  }, [hydrated, leftCollapsed]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_LEFT_WIDTH, String(leftWidth));
  }, [hydrated, leftWidth]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_RIGHT_COLLAPSED, rightCollapsed ? "1" : "0");
  }, [hydrated, rightCollapsed]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_RIGHT_WIDTH, String(rightWidth));
  }, [hydrated, rightWidth]);

  const setLeftCollapsed = useCallback((v: boolean) => {
    setLeftCollapsedState(v);
  }, []);

  const setRightCollapsed = useCallback((v: boolean) => {
    setRightCollapsedState(v);
  }, []);

  const setLeftWidth = useCallback((v: number) => {
    setLeftWidthState(Math.min(LEFT_MAX, Math.max(LEFT_MIN, v)));
  }, []);

  const setRightWidth = useCallback((v: number) => {
    setRightWidthState(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, v)));
  }, []);

  const toggleLeft = useCallback(() => {
    setLeftCollapsedState((x) => !x);
  }, []);

  const toggleRight = useCallback(() => {
    setRightCollapsedState((x) => !x);
  }, []);

  const maximizeLeft = useCallback(() => {
    setLeftCollapsedState(false);
    setLeftWidthState(LEFT_MAX);
  }, []);

  const maximizeRight = useCallback(() => {
    setRightCollapsedState(false);
    setRightWidthState(RIGHT_MAX);
  }, []);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  const closeMobileBalances = useCallback(() => {
    setMobileBalancesOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) {
        setMobileNavOpen(false);
        setMobileBalancesOpen(false);
        setLeftCollapsedState(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (
      (!mobileNavOpen && !mobileBalancesOpen) ||
      typeof document === "undefined"
    )
      return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen, mobileBalancesOpen]);

  const value = useMemo(
    (): ShellLayoutValue => ({
      leftCollapsed,
      leftWidth,
      rightCollapsed,
      rightWidth,
      setLeftCollapsed,
      setRightCollapsed,
      setLeftWidth,
      setRightWidth,
      toggleLeft,
      toggleRight,
      maximizeLeft,
      maximizeRight,
      mobileNavOpen,
      setMobileNavOpen,
      closeMobileNav,
      mobileBalancesOpen,
      setMobileBalancesOpen,
      closeMobileBalances,
    }),
    [
      leftCollapsed,
      leftWidth,
      rightCollapsed,
      rightWidth,
      setLeftCollapsed,
      setRightCollapsed,
      setLeftWidth,
      setRightWidth,
      toggleLeft,
      toggleRight,
      maximizeLeft,
      maximizeRight,
      mobileNavOpen,
      setMobileNavOpen,
      closeMobileNav,
      mobileBalancesOpen,
      setMobileBalancesOpen,
      closeMobileBalances,
    ],
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
