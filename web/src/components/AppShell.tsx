"use client";

import { Suspense } from "react";
import {
  ShellLayoutProvider,
  useShellLayout,
} from "@/lib/shellLayoutContext";
import { MobileTopBar } from "@/components/MobileTopBar";
import { SidebarNav } from "@/components/SidebarNav";

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

function AppShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen min-h-[100dvh] w-full min-w-0 flex-1 flex-col bg-[var(--background)] lg:flex-row">
      <MobileTopBar />
      <MobileNavBackdrop />
      <SidebarNav />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-14 lg:pt-0">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
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
