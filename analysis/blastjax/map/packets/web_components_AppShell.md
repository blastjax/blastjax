# Node web:components:AppShell: components/AppShell.tsx
Kind: module
Language: typescript, 57 lines of code, location: web/src/components/AppShell.tsx

Source excerpt: web/src/components/AppShell.tsx (first 65 lines)
```
   1  "use client";
   2  
   3  import { usePathname, useRouter } from "next/navigation";
   4  import { Suspense, useEffect } from "react";
   5  import { useCurrentUser } from "@/components/AuthGate";
   6  import { Header } from "@/components/Header";
   7  import { SidebarNav } from "@/components/SidebarNav";
   8  import { isPageAllowed } from "@/lib/nav";
   9  import {
  10    ShellLayoutProvider,
  11    useShellLayout,
  12  } from "@/lib/shellLayoutContext";
  13  
  14  function MobileNavBackdrop() {
  15    const { mobileNavOpen, closeMobileNav } = useShellLayout();
  16    if (!mobileNavOpen) return null;
  17    return (
  18      <button
  19        type="button"
  20        aria-label="Close navigation menu"
  21        className="fixed inset-0 z-[55] bg-zinc-950/50 backdrop-blur-[2px] lg:hidden"
  22        onClick={closeMobileNav}
  23      />
  24    );
  25  }
  26  
  27  function usePageAccessGuard() {
  28    const pathname = usePathname();
  29    const router = useRouter();
  30    const currentUser = useCurrentUser();
  31    const allowed = isPageAllowed(pathname, currentUser);
  32  
  33    useEffect(() => {
  34      if (!allowed) router.replace("/");
  35    }, [allowed, router]);
  36  
  37    return allowed;
  38  }
  39  
  40  function AppShellInner({ children }: { children: React.ReactNode }) {
  41    const allowed = usePageAccessGuard();
  42  
  43    return (
  44      <div className="flex min-h-screen min-h-[100dvh] w-full bg-page">
  45        <SidebarNav />
  46        <MobileNavBackdrop />
  47        <div className="flex min-w-0 flex-1 flex-col">
  48          <Header />
  49          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
  50            {allowed ? children : null}
  51          </main>
  52        </div>
  53      </div>
  54    );
  55  }
  56  
  57  export function AppShell({ children }: { children: React.ReactNode }) {
  58    return (
  59      <Suspense fallback={null}>
  60        <ShellLayoutProvider>
  61          <AppShellInner>{children}</AppShellInner>
  62        </ShellLayoutProvider>
  63      </Suspense>
  64    );
  65  }
```

## Outgoing connections
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/Header.tsx (web:components:Header)
- call -> components/SidebarNav.tsx (web:components:SidebarNav)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/shellLayoutContext.tsx (web:lib:shellLayoutContext)

## Incoming connections
- layout + error (web:layout) -> call
