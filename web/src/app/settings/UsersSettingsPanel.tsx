"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  createAppUser,
  deleteAppUser,
  errorMessage,
  updateAppUser,
  updateAppUserAccess,
  verifyAppUserPassword,
  type AppUserRow,
} from "@/lib/api";
import { formatDate } from "@/lib/dateFormat";
import { RESTRICTABLE_PAGES } from "@/lib/nav";
import { queries } from "@/lib/queries";
import { ErrorAlert } from "@/components/ErrorAlert";
import { Checkbox, Field, FormSection, LoadingBlocks, Panel } from "@/components/FinanceUI";
import { useFlashMessage } from "@/lib/useFlashMessage";
import {
  ACTION_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  INPUT_CLASSES,
  LIST_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

const MIN_PASSWORD_LENGTH = 8;

type EditState = { username: string; password: string; confirm: string };

function emptyEdit(username: string): EditState {
  return { username, password: "", confirm: "" };
}

function AccessControls({ user }: { user: AppUserRow }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = new Set(user.allowed_pages ?? RESTRICTABLE_PAGES.map((p) => p.href));

  async function save(next: { is_superuser: boolean; allowed_pages: string[] | null }) {
    setSaving(true);
    setError(null);
    try {
      await updateAppUserAccess(user.id, next);
    } catch (e: unknown) {
      setError(errorMessage(e, "Failed to update access."));
    } finally {
      setSaving(false);
    }
  }

  function togglePage(href: string) {
    const next = new Set(allowed);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    save({ is_superuser: user.is_superuser, allowed_pages: [...next] });
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-line bg-surface-3 p-3">
      <Checkbox
        label="Superuser (sees every page)"
        className="font-medium text-ink"
        checked={user.is_superuser}
        disabled={saving}
        onChange={(e) => save({ is_superuser: e.target.checked, allowed_pages: user.allowed_pages })}
      />
      {!user.is_superuser && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {RESTRICTABLE_PAGES.map((p) => (
            <Checkbox
              key={p.href}
              label={p.label}
              checked={allowed.has(p.href)}
              disabled={saving}
              onChange={() => togglePage(p.href)}
            />
          ))}
        </div>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </div>
  );
}

export function UsersSettingsPanel() {
  const usersQuery = useQuery(queries.appUsers());
  const users = usersQuery.data?.users ?? [];
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const loadError = usersQuery.error ? errorMessage(usersQuery.error, "Failed to load users.") : deleteError;

  const [newUser, setNewUser] = useState<EditState>(emptyEdit(""));
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>(emptyEdit(""));
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [infoMsg, setInfoMsg] = useFlashMessage();

  const [verifyUsername, setVerifyUsername] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"valid" | "invalid" | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

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
    } catch (e: unknown) {
      setAddError(errorMessage(e, "Failed to add user."));
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

  async function handleSaveEdit(userId: string) {
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
    } catch (e: unknown) {
      setEditError(errorMessage(e, "Failed to update user."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(user: AppUserRow) {
    if (!(await confirmDialog(`Delete user "${user.username}"?`))) return;
    try {
      await deleteAppUser(user.id);
      setInfoMsg(`Deleted "${user.username}".`);
    } catch (e: unknown) {
      setDeleteError(errorMessage(e, "Failed to delete user."));
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
      setVerifyError(errorMessage(e, "Failed to check password."));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Panel
      title="Users"
      subtitle="Add or manage named users and their passwords. Each user's username and password can log in to the app once they're added here — the first user you add turns login on."
    >
      <div className="flex flex-col gap-6">
        {usersQuery.isPending ? (
          <LoadingBlocks label="Loading users…" rows={0} />
        ) : loadError ? (
          <ErrorAlert>{loadError}</ErrorAlert>
        ) : users.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>No users yet.</div>
        ) : (
          <ul className={LIST_CLASSES}>
            {users.map((user) => (
              <li key={user.id} className="p-4">
                {editingId === user.id ? (
                  <div className="flex flex-col gap-4">
                    <Field label="Username">
                      <input
                        type="text"
                        className={INPUT_CLASSES}
                        value={editState.username}
                        onChange={(e) => setEditState((s) => ({ ...s, username: e.target.value }))}
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="New password" hint="Optional">
                        <input
                          type="password"
                          className={INPUT_CLASSES}
                          value={editState.password}
                          onChange={(e) => setEditState((s) => ({ ...s, password: e.target.value }))}
                          autoComplete="new-password"
                        />
                      </Field>
                      <Field label="Confirm new password">
                        <input
                          type="password"
                          className={INPUT_CLASSES}
                          value={editState.confirm}
                          onChange={(e) => setEditState((s) => ({ ...s, confirm: e.target.value }))}
                          autoComplete="new-password"
                        />
                      </Field>
                    </div>
                    {editError && <ErrorAlert>{editError}</ErrorAlert>}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={PRIMARY_BUTTON_CLASSES}
                        disabled={savingEdit}
                        onClick={() => handleSaveEdit(user.id)}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{user.username}</p>
                      <p className="text-xs text-ink-3">Added {formatDate(user.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className={EDIT_BUTTON_CLASSES} onClick={() => startEdit(user)}>
                        Edit
                      </button>
                      <button type="button" className={DELETE_BUTTON_CLASSES} onClick={() => handleDelete(user)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                <AccessControls user={user} />
              </li>
            ))}
          </ul>
        )}

        <FormSection
          title="Verify a password"
          description="Checks a username/password pair against what's stored. Doesn't sign anyone in."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Username">
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
            </Field>
            <Field label="Password">
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
            </Field>
          </div>
          {verifyError && <ErrorAlert>{verifyError}</ErrorAlert>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={ACTION_BUTTON_CLASSES} disabled={verifying} onClick={handleVerify}>
              {verifying ? "Checking…" : "Check password"}
            </button>
            {verifyResult === "valid" && (
              <span role="status" className="text-sm font-medium text-success-text">
                ✓ Matches the stored password.
              </span>
            )}
            {verifyResult === "invalid" && (
              <span role="status" className="text-sm font-medium text-danger-text">
                ✗ Doesn&apos;t match.
              </span>
            )}
          </div>
        </FormSection>

        <FormSection title="Add a user">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Username">
              <input
                type="text"
                className={INPUT_CLASSES}
                value={newUser.username}
                onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
                autoComplete="off"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                className={INPUT_CLASSES}
                value={newUser.password}
                onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                className={INPUT_CLASSES}
                value={newUser.confirm}
                onChange={(e) => setNewUser((s) => ({ ...s, confirm: e.target.value }))}
                autoComplete="new-password"
              />
            </Field>
          </div>
          {addError && <ErrorAlert>{addError}</ErrorAlert>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY_BUTTON_CLASSES} disabled={adding} onClick={handleAdd}>
              {adding ? "Adding…" : "Add user"}
            </button>
            {infoMsg && (
              <span role="status" className="text-sm text-success-text">
                {infoMsg}
              </span>
            )}
          </div>
        </FormSection>
      </div>
    </Panel>
  );
}
