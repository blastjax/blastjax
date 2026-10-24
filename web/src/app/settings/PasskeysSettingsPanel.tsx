"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/AuthGate";
import { confirmDialog } from "@/components/ConfirmDialog";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks } from "@/components/FinanceUI";
import { addPasskey, deletePasskey, getPasskeys, type PasskeyRow } from "@/lib/api";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth";
import { formatDate } from "@/lib/dateFormat";
import {
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  INPUT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
} from "@/lib/ui";

export function PasskeysSettingsPanel() {
  const loggedIn = useCurrentUser() !== null;
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(loggedIn);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true);
    getPasskeys()
      .then((res) => setPasskeys(res.passkeys))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load passkeys."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn]);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await addPasskey(name.trim());
      setName("");
      load();
    } catch (e: unknown) {
      setError(passkeyErrorMessage(e, "Failed to add passkey."));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(passkey: PasskeyRow) {
    if (!(await confirmDialog(`Remove passkey "${passkey.name}"?`))) return;
    setError(null);
    try {
      await deletePasskey(passkey.id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove passkey.");
    }
  }

  return (
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-medium text-ink">Passkeys</h2>
      <p className="mt-1 text-sm text-ink-2">
        Log in with your fingerprint, face, or device PIN instead of a password. Passkeys
        added here belong to the user you&apos;re logged in as.
      </p>

      {!loggedIn ? (
        <div className={`mt-6 ${DASHED_EMPTY_CLASSES}`}>Log in as a user to add passkeys.</div>
      ) : (
        <>
          <div className="mt-6">
            {loading ? (
              <LoadingBlocks label="Loading passkeys…" rows={0} />
            ) : passkeys.length === 0 ? (
              <div className={DASHED_EMPTY_CLASSES}>No passkeys yet.</div>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-lg border border-line dark:divide-zinc-900">
                {passkeys.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-3">
                        Added {formatDate(p.created_at)} ·{" "}
                        {p.last_used_at ? `Last used ${formatDate(p.last_used_at)}` : "Never used"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={DELETE_BUTTON_CLASSES}
                      onClick={() => handleDelete(p)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <ErrorAlert className="mt-3">{error}</ErrorAlert>}

          {passkeysSupported() ? (
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-ink-2" htmlFor="passkey-name">
                  Name (optional)
                </label>
                <input
                  id="passkey-name"
                  type="text"
                  className={INPUT_CLASSES}
                  placeholder="e.g. iPhone"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                disabled={adding}
                onClick={handleAdd}
              >
                {adding ? "Waiting for device…" : "Add a passkey"}
              </button>
            </div>
          ) : (
            <p className="mt-6 text-sm text-ink-3">This browser doesn&apos;t support passkeys.</p>
          )}
        </>
      )}
    </section>
  );
}
