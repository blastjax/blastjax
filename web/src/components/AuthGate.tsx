"use client";

import { useCallback, useEffect, useState } from "react";
import { dataApiBase } from "@/lib/api";
import {
  AUTH_UNAUTHORIZED_EVENT,
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from "@/lib/auth";

type Status = "checking" | "unreachable" | "unauthenticated" | "authenticated";

const CARD_CLASS =
  "w-full max-w-xs rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] w-full items-center justify-center bg-[var(--background)] px-4">
      {children}
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [code, setCode] = useState("");
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
      const data = (await res.json()) as { authenticated: boolean; otp_required: boolean };
      if (!data.otp_required || data.authenticated) {
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
      const res = await fetch(`${dataApiBase()}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => null)) as
        | { token?: string; detail?: string }
        | null;
      if (!res.ok || !data?.token) {
        throw new Error(typeof data?.detail === "string" ? data.detail : "Invalid code.");
      }
      setSessionToken(data.token);
      setCode("");
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unreachable") {
    return (
      <Screen>
        <div className={CARD_CLASS}>
          <h1 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Can&apos;t reach the server
          </h1>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            The API at {dataApiBase()} didn&apos;t respond.
          </p>
          <button
            type="button"
            onClick={checkStatus}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
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
          <h1 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Enter code
          </h1>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Enter the 6-digit code from your authenticator app.
          </p>
          <input
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="mb-3 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-center text-lg tracking-widest text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-100"
            placeholder="000000"
          />
          {error ? (
            <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {submitting ? "Checking…" : "Continue"}
          </button>
        </form>
      </Screen>
    );
  }

  return <>{children}</>;
}
