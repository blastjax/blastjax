# Node web:lib:auth: lib/auth.ts
Kind: module
Language: typescript, 37 lines of code, location: web/src/lib/auth.ts

Source excerpt: web/src/lib/auth.ts (first 43 lines)
```
   1  const SESSION_TOKEN_KEY = "budget-session";
   2  
   3  export const AUTH_UNAUTHORIZED_EVENT = "budget-auth:unauthorized";
   4  
   5  export function getSessionToken(): string | null {
   6    if (typeof window === "undefined") return null;
   7    try {
   8      return localStorage.getItem(SESSION_TOKEN_KEY);
   9    } catch {
  10      return null;
  11    }
  12  }
  13  
  14  export function setSessionToken(token: string): void {
  15    if (typeof window === "undefined") return;
  16    try {
  17      localStorage.setItem(SESSION_TOKEN_KEY, token);
  18    } catch {
  19    }
  20  }
  21  
  22  export function clearSessionToken(): void {
  23    if (typeof window === "undefined") return;
  24    try {
  25      localStorage.removeItem(SESSION_TOKEN_KEY);
  26    } catch {
  27    }
  28  }
  29  
  30  export function passkeysSupported(): boolean {
  31    return (
  32      typeof window !== "undefined" &&
  33      typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON === "function"
  34    );
  35  }
  36  
  37  export function passkeyErrorMessage(err: unknown, fallback: string): string {
  38    if (err instanceof DOMException && err.name === "NotAllowedError") return "Passkey request was cancelled.";
  39    if (err instanceof DOMException && err.name === "InvalidStateError") {
  40      return "This device already has a passkey for your account.";
  41    }
  42    return err instanceof Error ? err.message : fallback;
  43  }
```

## Outgoing connections
- none

## Incoming connections
- components/AuthGate.tsx (web:components:AuthGate) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- lib/api.ts (web:lib:api) -> call
- /settings (web:settings) -> call
