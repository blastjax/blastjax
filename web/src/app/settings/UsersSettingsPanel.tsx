"use client";

import { useEffect, useState } from "react";
import {
  createAppUser,
  deleteAppUser,
  getAppUsers,
  updateAppUser,
  verifyAppUserPassword,
  type AppUserRow,
} from "@/lib/api";
import {
  ACTION_BUTTON_CLASSES,
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

const MIN_PASSWORD_LENGTH = 8;

type EditState = { username: string; password: string; confirm: string };

function emptyEdit(username: string): EditState {
  return { username, password: "", confirm: "" };
}

export function UsersSettingsPanel() {
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState<EditState>(emptyEdit(""));
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>(emptyEdit(""));
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const [verifyUsername, setVerifyUsername] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"valid" | "invalid" | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    getAppUsers()
      .then((res) => setUsers(res.users))
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : "Failed to load users."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!infoMsg) return;
    const t = window.setTimeout(() => setInfoMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [infoMsg]);

  async function handleAdd() {
    const username = newUser.username.trim();
    if (!username) {
      setAddError("Enter a username.");
      return;
    }
    if (newUser.password.length < MIN_PASSWORD_LENGTH) {
      setAddError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newUser.password !== newUser.confirm) {
      setAddError("Passwords don't match.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createAppUser({ username, password: newUser.password });
      setNewUser(emptyEdit(""));
      setInfoMsg(`Added "${username}".`);
      load();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to add user.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(user: AppUserRow) {
    setEditingId(user.id);
    setEditState(emptyEdit(user.username));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(userId: number) {
    const username = editState.username.trim();
    if (!username) {
      setEditError("Username can't be blank.");
      return;
    }
    const wantsPasswordChange = editState.password.length > 0 || editState.confirm.length > 0;
    if (wantsPasswordChange) {
      if (editState.password.length < MIN_PASSWORD_LENGTH) {
        setEditError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (editState.password !== editState.confirm) {
        setEditError("Passwords don't match.");
        return;
      }
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updateAppUser(userId, {
        username,
        ...(wantsPasswordChange ? { password: editState.password } : {}),
      });
      setEditingId(null);
      setInfoMsg("User updated.");
      load();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(user: AppUserRow) {
    if (!confirm(`Delete user "${user.username}"?`)) return;
    try {
      await deleteAppUser(user.id);
      setInfoMsg(`Deleted "${user.username}".`);
      load();
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to delete user.");
    }
  }

  async function handleVerify() {
    const username = verifyUsername.trim();
    if (!username || !verifyPassword) {
      setVerifyError("Enter a username and password to check.");
      setVerifyResult(null);
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const res = await verifyAppUserPassword(username, verifyPassword);
      setVerifyResult(res.valid ? "valid" : "invalid");
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : "Failed to check password.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-medium text-ink">Users</h2>
      <p className="mt-1 text-sm text-ink-2">
        Add or manage named users and their passwords. Each user&apos;s
        username and password can log in to the app once they&apos;re added
        here — the first user you add turns login on.
      </p>

      <div className="mt-6">
        {loading ? (
          <p className={LOADING_TEXT_CLASSES}>Loading users…</p>
        ) : loadError ? (
          <div className={ERROR_ALERT_CLASSES} role="alert">{loadError}</div>
        ) : users.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>No users yet.</div>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-line dark:divide-zinc-900">
            {users.map((user) => (
              <li key={user.id} className="p-4">
                {editingId === user.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-ink-2">
                        Username
                      </label>
                      <input
                        type="text"
                        className={INPUT_CLASSES}
                        value={editState.username}
                        onChange={(e) =>
                          setEditState((s) => ({ ...s, username: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-ink-2">
                          New password (optional)
                        </label>
                        <input
                          type="password"
                          className={INPUT_CLASSES}
                          value={editState.password}
                          onChange={(e) =>
                            setEditState((s) => ({ ...s, password: e.target.value }))
                          }
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-ink-2">
                          Confirm new password
                        </label>
                        <input
                          type="password"
                          className={INPUT_CLASSES}
                          value={editState.confirm}
                          onChange={(e) =>
                            setEditState((s) => ({ ...s, confirm: e.target.value }))
                          }
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    {editError && <div className={ERROR_ALERT_CLASSES} role="alert">{editError}</div>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={PRIMARY_BUTTON_CLASSES}
                        disabled={savingEdit}
                        onClick={() => handleSaveEdit(user.id)}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={SECONDARY_BUTTON_CLASSES}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        {user.username}
                      </p>
                      <p className="text-xs text-ink-3">
                        Added {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={EDIT_BUTTON_CLASSES}
                        onClick={() => startEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={DELETE_BUTTON_CLASSES}
                        onClick={() => handleDelete(user)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="mt-8 rounded-lg border border-line bg-zinc-50/80 px-4 py-4 dark:bg-zinc-900/40">
        <legend className="px-1 text-sm font-medium text-ink">
          Verify a password
        </legend>
        <p className="mt-1 text-xs text-ink-2">
          Checks a username/password pair against what&apos;s stored. Doesn&apos;t sign
          anyone in.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-2">
              Username
            </label>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={verifyUsername}
              onChange={(e) => {
                setVerifyUsername(e.target.value);
                setVerifyResult(null);
              }}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-2">
              Password
            </label>
            <input
              type="password"
              className={INPUT_CLASSES}
              value={verifyPassword}
              onChange={(e) => {
                setVerifyPassword(e.target.value);
                setVerifyResult(null);
              }}
              autoComplete="off"
            />
          </div>
        </div>
        {verifyError && <div className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">{verifyError}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={ACTION_BUTTON_CLASSES}
            disabled={verifying}
            onClick={handleVerify}
          >
            {verifying ? "Checking…" : "Check password"}
          </button>
          {verifyResult === "valid" && (
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              ✓ Matches the stored password.
            </span>
          )}
          {verifyResult === "invalid" && (
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              ✗ Doesn&apos;t match.
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="mt-8 rounded-lg border border-line bg-zinc-50/80 px-4 py-4 dark:bg-zinc-900/40">
        <legend className="px-1 text-sm font-medium text-ink">
          Add a user
        </legend>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-2">
              Username
            </label>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={newUser.username}
              onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-2">
              Password
            </label>
            <input
              type="password"
              className={INPUT_CLASSES}
              value={newUser.password}
              onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink-2">
              Confirm password
            </label>
            <input
              type="password"
              className={INPUT_CLASSES}
              value={newUser.confirm}
              onChange={(e) => setNewUser((s) => ({ ...s, confirm: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
        </div>
        {addError && <div className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">{addError}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASSES}
            disabled={adding}
            onClick={handleAdd}
          >
            {adding ? "Adding…" : "Add user"}
          </button>
          {infoMsg && (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">{infoMsg}</span>
          )}
        </div>
      </fieldset>
    </section>
  );
}
