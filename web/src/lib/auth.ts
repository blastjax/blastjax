/**
 * OTP session token, kept in `sessionStorage` (not `localStorage`) on
 * purpose: it disappears when the browser restarts, so a fresh 6-digit code
 * is required each new browser session, while surviving reloads/tab
 * switches within one.
 */
const SESSION_TOKEN_KEY = "budget-otp-session";

/** Fired on the window when a request comes back 401 mid-session. */
export const AUTH_UNAUTHORIZED_EVENT = "budget-auth:unauthorized";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
