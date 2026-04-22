"use client";

import { usePathname } from "next/navigation";
import { Suspense, useCallback, useRef } from "react";
import { AccountBalanceSidebar } from "@/components/AccountBalanceSidebar";
import { UserPreferencesHydrate } from "@/components/UserPreferencesHydrate";
import { AccountExploreProvider } from "@/lib/accountExploreContext";
import { AccountBalancesRefreshProvider } from "@/lib/accountBalancesRefreshContext";
import {
  LEFT_MAX,
  LEFT_MIN,
  RIGHT_MAX,
  RIGHT_MIN,
  ShellLayoutProvider,
  useShellLayout,
} from "@/lib/shellLayoutContext";
import { WorkbookActiveSheetProvider } from "@/lib/workbookActiveSheetContext";
import { MobileTopBar } from "@/components/MobileTopBar";
import { SidebarNav } from "@/components/SidebarNav";
import { TransactionModalProvider } from "@/components/TransactionModalProvider";

function LeftResizeHandle() {
  const { leftCollapsed, leftWidth, setLeftWidth } = useShellLayout();
  const startRef = useRef({ x: 0, w: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (leftCollapsed) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      startRef.current = { x: e.clientX, w: leftWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startRef.current.x;
        const next = Math.min(
          LEFT_MAX,
          Math.max(LEFT_MIN, startRef.current.w + dx),
        );
        setLeftWidth(next);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [leftCollapsed, leftWidth, setLeftWidth],
  );

  if (leftCollapsed) return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize navigation panel"
      className="z-20 hidden w-2 shrink-0 cursor-col-resize touch-none select-none self-stretch border-0 bg-zinc-200/90 hover:bg-indigo-400/40 active:bg-indigo-500/45 dark:bg-zinc-700/90 dark:hover:bg-indigo-500/30 dark:active:bg-indigo-500/40 lg:block"
      onPointerDown={onPointerDown}
    />
  );
}

function RightResizeHandle({ visible }: { visible: boolean }) {
  const { rightCollapsed, rightWidth, setRightWidth } = useShellLayout();
  const startRef = useRef({ x: 0, w: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!visible || rightCollapsed) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      startRef.current = { x: e.clientX, w: rightWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startRef.current.x;
        // Handle sits on the main-content side of the balances panel: invert so
        // dragging toward the balances column widens it (matches left-nav feel).
        const next = Math.min(
          RIGHT_MAX,
          Math.max(RIGHT_MIN, startRef.current.w - dx),
        );
        setRightWidth(next);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [visible, rightCollapsed, rightWidth, setRightWidth],
  );

  if (!visible || rightCollapsed) return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to resize account balances panel"
      className="z-20 hidden w-2 shrink-0 cursor-col-resize touch-none select-none self-stretch border-0 bg-zinc-200/90 hover:bg-indigo-400/40 active:bg-indigo-500/45 dark:bg-zinc-700/90 dark:hover:bg-indigo-500/30 dark:active:bg-indigo-500/40 lg:block"
      onPointerDown={onPointerDown}
    />
  );
}

function MobileNavBackdrop() {
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  if (!mobileNavOpen) return null;
  return (
    <button
      type="button"
      aria-label="Close navigation menu"
      className="fixed inset-x-0 bottom-0 top-14 z-[50] bg-zinc-900/45 backdrop-blur-[1px] lg:hidden"
      onClick={closeMobileNav}
    />
  );
}

function MobileBalancesBackdrop() {
  const { mobileBalancesOpen, closeMobileBalances } = useShellLayout();
  if (!mobileBalancesOpen) return null;
  return (
    <button
      type="button"
      aria-label="Close account balances"
      className="fixed inset-x-0 bottom-0 top-14 z-[51] bg-zinc-900/45 backdrop-blur-[1px] lg:hidden"
      onClick={closeMobileBalances}
    />
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showBalance =
    pathname === "/" ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/stats") ||
    pathname.startsWith("/summary") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/accounts");

  return (
    <AccountExploreProvider>
      <AccountBalancesRefreshProvider>
        <WorkbookActiveSheetProvider>
          <TransactionModalProvider>
            <UserPreferencesHydrate />
            <div className="relative flex min-h-screen min-h-[100dvh] w-full min-w-0 flex-1 flex-col bg-[var(--background)] lg:flex-row">
              <MobileTopBar />
              <MobileNavBackdrop />
              <MobileBalancesBackdrop />
              <SidebarNav />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-14 lg:flex-row lg:pt-0">
                <LeftResizeHandle />
                <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
                  {children}
                </div>
                {showBalance ? (
                  <>
                    <RightResizeHandle visible />
                    <AccountBalanceSidebar />
                  </>
                ) : null}
              </div>
            </div>
          </TransactionModalProvider>
        </WorkbookActiveSheetProvider>
      </AccountBalancesRefreshProvider>
    </AccountExploreProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ShellLayoutProvider>
        <AppShellInner>{children}</AppShellInner>
      </ShellLayoutProvider>
    </Suspense>
  );
}
