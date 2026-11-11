"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentUser } from "@/components/AuthGate";
import { confirmDialog } from "@/components/ConfirmDialog";
import { ErrorAlert } from "@/components/ErrorAlert";
import { Field, LoadingBlocks, Panel } from "@/components/FinanceUI";
import { addPasskey, deletePasskey, errorMessage, type PasskeyRow } from "@/lib/api";
import { queries } from "@/lib/queries";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/auth";
import { formatDate } from "@/lib/dateFormat";
import {
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  INPUT_CLASSES,
  LIST_CLASSES,
  PRIMARY_BUTTON_CLASSES,
} from "@/lib/ui";

export function PasskeysSettingsPanel() {
  const loggedIn = useCurrentUser() !== null;
  const passkeysQuery = useQuery({ ...queries.passkeys(), enabled: loggedIn });
  const passkeys = passkeysQuery.data?.passkeys ?? [];
  const loading = loggedIn && passkeysQuery.isPending;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? (passkeysQuery.error ? errorMessage(passkeysQuery.error, "Failed to load passkeys.") : null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await addPasskey(name.trim());
      setName("");
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
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to remove passkey."));
    }
  }

  return (
    <Panel
      title="Passkeys"
      subtitle="Log in with your fingerprint, face, or device PIN instead of a password. Passkeys added here belong to the user you're logged in as."
    >
      {!loggedIn ? (
        <div className={DASHED_EMPTY_CLASSES}>Log in as a user to add passkeys.</div>
      ) : (
        <>
          <div>
            {loading ? (
              <LoadingBlocks label="Loading passkeys…" rows={0} />
            ) : passkeys.length === 0 ? (
              <div className={DASHED_EMPTY_CLASSES}>No passkeys yet.</div>
            ) : (
              <ul className={LIST_CLASSES}>
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
              <Field label="Name (optional)" className="min-w-48 flex-1">
                <input
                  type="text"
                  className={INPUT_CLASSES}
                  placeholder="e.g. iPhone"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </Field>
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
    </Panel>
  );
}
