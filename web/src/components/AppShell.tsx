"use client";

import { Suspense } from "react";
import { Header } from "@/components/Header";
import { SidebarNav } from "@/components/SidebarNav";
import {
  ShellLayoutProvider,
  useShellLayout,
} from "@/lib/shellLayoutContext";

function MobileNavBackdrop() {
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  if (!mobileNavOpen) return null;
  return (
    <button
      type="button"
      aria-label="Close navigation menu"
      className="fixed inset-0 z-[55] bg-zinc-950/50 backdrop-blur-[2px] lg:hidden"
      onClick={closeMobileNav}
    />
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  return (
    // Scrolling happens at the document level so both the sidebar and the
    // header can be plain `sticky` elements instead of fixed overlays the
    // content has to be padded around.
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-page">
      <SidebarNav />
      <MobileNavBackdrop />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
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
