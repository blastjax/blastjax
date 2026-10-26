const SESSION_TOKEN_KEY = "budget-session";

export const AUTH_UNAUTHORIZED_EVENT = "budget-auth:unauthorized";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
  }
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
  }
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON === "function"
  );
}

export function passkeyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === "NotAllowedError") return "Passkey request was cancelled.";
  if (err instanceof DOMException && err.name === "InvalidStateError") {
    return "This device already has a passkey for your account.";
  }
  return err instanceof Error ? err.message : fallback;
}
