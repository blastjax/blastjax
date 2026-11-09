# Node web:components:AuthGate: components/AuthGate.tsx
Kind: module
Language: typescript, 211 lines of code, location: web/src/components/AuthGate.tsx

Source excerpt: web/src/components/AuthGate.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { createContext, useCallback, useContext, useEffect, useState } from "react";
   4  import { dataApiBase } from "@/lib/api";
   5  import {
   6    AUTH_UNAUTHORIZED_EVENT,
   7    clearSessionToken,
   8    getSessionToken,
   9    passkeyErrorMessage,
  10    passkeysSupported,
  11    setSessionToken,
  12  } from "@/lib/auth";
  13  import type { PageAccess } from "@/lib/nav";
  14  import {
  15    CARD_CLASSES,
  16    INPUT_CLASSES,
  17    LABEL_CLASSES,
  18    PRIMARY_BUTTON_CLASSES,
  19    SECONDARY_BUTTON_CLASSES,
  20  } from "@/lib/ui";
  21  
  22  type Status = "checking" | "unreachable" | "unauthenticated" | "authenticated";
  23  
  24  type StatusUser = { username: string; is_superuser: boolean; allowed_pages: string[] | null } | null;
  25  
  26  const CurrentUserContext = createContext<PageAccess | null>(null);
  27  
  28  export function useCurrentUser(): PageAccess | null {
  29    return useContext(CurrentUserContext);
  30  }
  31  
  32  const CARD_CLASS = `w-full max-w-sm ${CARD_CLASSES}`;
  33  
  34  const FIELD_CLASS = `mb-4 w-full ${INPUT_CLASSES}`;
  35  
  36  function Screen({ children }: { children: React.ReactNode }) {
  37    return (
  38      <div className="flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-page px-4">
  39        <div className="flex items-center gap-3">
  40          <span className="text-lg font-semibold tracking-[-0.2px] text-ink">
  41            Blastjax
  42          </span>
  43        </div>
  44        {children}
  45      </div>
  46    );
  47  }
  48  
  49  export function AuthGate({ children }: { children: React.ReactNode }) {
  50    const [status, setStatus] = useState<Status>("checking");
  51    const [currentUser, setCurrentUser] = useState<PageAccess | null>(null);
  52    const [username, setUsername] = useState("");
  53    const [password, setPassword] = useState("");
  54    const [error, setError] = useState<string | null>(null);
  55    const [submitting, setSubmitting] = useState(false);
  56  
  57    const checkStatus = useCallback(async () => {
  58      setStatus("checking");
  59      try {
  60        const token = getSessionToken();
  61        const res = await fetch(`${dataApiBase()}/api/auth/status`, {
  62          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  63          cache: "no-store",
  64        });
  65        if (!res.ok) throw new Error(`HTTP ${res.status}`);
  66        const data = (await res.json()) as {
  67          authenticated: boolean;
  68          login_required: boolean;
  69          user?: StatusUser;
  70        };
  71        if (!data.login_required || data.authenticated) {
  72          setCurrentUser(
  73            data.user
  74              ? { isSuperuser: data.user.is_superuser, allowedPages: data.user.allowed_pages }
  75              : null,
  76          );
  77          setStatus("authenticated");
  78          return;
  79        }
  80        clearSessionToken();
  81        setStatus("unauthenticated");
  82      } catch {
  83        setStatus("unreachable");
  84      }
  85    }, []);
  86  
  87    useEffect(() => {
  88      checkStatus();
  89    }, [checkStatus]);
  90  
  91    useEffect(() => {
  92      const onUnauthorized = () => {
  93        setError("Your session ended. Log in again.");
  94        setStatus("unauthenticated");
  95      };
  96      window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  97      return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  98    }, []);
  99  
 100    async function logIn(path: string, body: () => Promise<unknown>) {
 101      setSubmitting(true);
 102      setError(null);
 103      try {
 104        const res = await fetch(`${dataApiBase()}${path}`, {
 105          method: "POST",
 106          headers: { "Content-Type": "application/json" },
 107          body: JSON.stringify(await body()),
 108        });
 109        const data = (await res.json().catch(() => null)) as
 110          | { token?: string; detail?: string }
 111          | null;
 112        if (!res.ok || !data?.token) {
 113          throw new Error(
 114            typeof data?.detail === "string" ? data.detail : "Invalid username or password.",
 115          );
 116        }
 117        setSessionToken(data.token);
 118        setPassword("");
 119        await checkStatus();
 120      } catch (err) {
 121        setError(passkeyErrorMessage(err, "Invalid username or password."));
 122      } finally {
 123        setSubmitting(false);
 124      }
 125    }
 126  
 127    function handleSubmit(e: React.FormEvent) {
 128      e.preventDefault();
 129      logIn("/api/auth/login", async () => ({ username, password }));
 130    }
 131  
 132    function handlePasskeyLogin() {
 133      logIn("/api/auth/passkey/login", async () => {
 134        const res = await fetch(`${dataApiBase()}/api/auth/passkey/login/options`, { method: "POST" });
 135        if (!res.ok) throw new Error("Couldn't start passkey login.");
 136        const credential = await navigator.credentials.get({
 137          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(await res.json()),
 138        });
 139        if (!(credential instanceof PublicKeyCredential)) throw new Error("No passkey was chosen.");
 140        return { credential: credential.toJSON() };
 141      });
 142    }
 143  
 144    if (status === "checking") return null;
 145  
 146    if (status === "unreachable") {
 147      return (
 148        <Screen>
 149          <div className={CARD_CLASS}>
 150            <h1 className="mb-1 text-lg font-semibold tracking-[-0.2px] text-ink">
```

## Outgoing connections
- dispatch -> routers/auth.py (be:router:auth)
- call -> lib/api.ts (web:lib:api)
- call -> lib/auth.ts (web:lib:auth)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- components/AppShell.tsx (web:components:AppShell) -> call
- components/Header.tsx (web:components:Header) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- Home page (web:home) -> call
- layout + error (web:layout) -> call
- /settings (web:settings) -> call
