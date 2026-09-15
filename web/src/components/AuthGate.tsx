"use client";

import { useCallback, useEffect, useState } from "react";
import { dataApiBase } from "@/lib/api";
import {
  AUTH_UNAUTHORIZED_EVENT,
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from "@/lib/auth";
import {
  CARD_CLASSES,
  INPUT_CLASSES,
  LABEL_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

type Status = "checking" | "unreachable" | "unauthenticated" | "authenticated";

const CARD_CLASS = `w-full max-w-sm ${CARD_CLASSES}`;

const FIELD_CLASS = `mb-4 w-full ${INPUT_CLASSES}`;

/** Full-bleed, centered stage for the pre-shell screens (login, unreachable). */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-page px-4">
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold tracking-[-0.2px] text-ink">
          Blastjax
        </span>
      </div>
      {children}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkStatus = useCallback(async () => {
    setStatus("checking");
    try {
      const token = getSessionToken();
      const res = await fetch(`${dataApiBase()}/api/auth/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        authenticated: boolean;
        login_required: boolean;
      };
      if (!data.login_required || data.authenticated) {
        setStatus("authenticated");
        return;
      }
      clearSessionToken();
      setStatus("unauthenticated");
    } catch {
      // Every screen in this app is API-backed, so rendering the shell here
      // would just fill it with failed requests. Say so and offer a retry
      // instead of guessing whether a session would have been valid.
      setStatus("unreachable");
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const onUnauthorized = () => setStatus("unauthenticated");
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${dataApiBase()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { token?: string; detail?: string }
        | null;
      if (!res.ok || !data?.token) {
        throw new Error(
          typeof data?.detail === "string" ? data.detail : "Invalid username or password.",
        );
      }
      setSessionToken(data.token);
      setPassword("");
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unreachable") {
    return (
      <Screen>
        <div className={CARD_CLASS}>
          <h1 className="mb-1 text-lg font-semibold tracking-[-0.2px] text-ink">
            Can&apos;t reach the server
          </h1>
          <p className="mb-5 text-sm text-ink-3">
            The API at {dataApiBase()} didn&apos;t respond.
          </p>
          <button
            type="button"
            onClick={checkStatus}
            className={`w-full ${SECONDARY_BUTTON_CLASSES}`}
          >
            Retry
          </button>
        </div>
      </Screen>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Screen>
        <form onSubmit={handleSubmit} className={CARD_CLASS}>
          <h1 className="mb-1 text-lg font-semibold tracking-[-0.2px] text-ink">
            Log in
          </h1>
          <p className="mb-5 text-sm text-ink-3">
            Enter your username and password.
          </p>
          <label className={LABEL_CLASSES} htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            autoFocus
            autoComplete="username"
            placeholder="you"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={FIELD_CLASS}
          />
          <label className={LABEL_CLASSES} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD_CLASS}
          />
          {error ? (
            <p className="mb-3 text-sm text-danger-text" role="alert">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !username || !password}
            className={`w-full ${PRIMARY_BUTTON_CLASSES}`}
          >
            {submitting ? "Checking…" : "Log in"}
          </button>
        </form>
      </Screen>
    );
  }

  return <>{children}</>;
}
