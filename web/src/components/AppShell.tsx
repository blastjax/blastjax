"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useCurrentUser } from "@/components/AuthGate";
import { Header } from "@/components/Header";
import { SidebarNav } from "@/components/SidebarNav";
import { isPageAllowed } from "@/lib/nav";
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

function usePageAccessGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const allowed = isPageAllowed(pathname, currentUser);

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  return allowed;
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const allowed = usePageAccessGuard();

  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full bg-page">
      <SidebarNav />
      <MobileNavBackdrop />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
          {allowed ? children : null}
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
