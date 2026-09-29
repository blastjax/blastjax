const SESSION_TOKEN_KEY = "budget-session";

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
  }
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
  }
}
