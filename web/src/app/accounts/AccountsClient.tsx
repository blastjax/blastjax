"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAccountBalances,
  getBudgetLabels,
  getWorkbook,
  removeBudgetCurrencyLabel,
  renameBudgetAccountLabel,
} from "@/lib/api";
import { applyAccountLabelRenameEverywhere } from "@/lib/accountLabelRename";
import {
  isConfiguredSubcurrencyShownInLists,
  setAccountsSubcurrencyShown,
  useAccountsSubcurrencyHidden,
} from "@/lib/accountsSubcurrencyVisibility";
import {
  hideAllBalanceSidebarAccounts,
  isAccountShownInBalanceSidebar,
  setBalanceSidebarAccountShown,
  useBalanceSidebarHidden,
} from "@/lib/accountBalanceSidebarVisibility";
import {
  isAccountExcludedFromBalanceTotal,
  setAccountExcludedFromBalanceTotal,
  useBalanceSidebarTotalExcluded,
} from "@/lib/accountBalanceTotalExclusion";
import { useBumpAccountBalancesRefresh } from "@/lib/accountBalancesRefreshContext";
import { computeDisplayAccountNames } from "@/lib/accountsDisplayList";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  normalizeCurrencyCode,
  useCurrencySettings,
} from "@/lib/currencySettings";
import {
  addDeletedAccount,
  type DeletedAccountEntry,
  removeDeletedAccount,
  useDeletedAccounts,
} from "@/lib/deletedAccounts";
import {
  addManualAccount,
  removeManualAccount,
  useManualAccounts,
} from "@/lib/manualAccounts";

const SIDEBAR_DEFAULT_HIDDEN_KEY = "budgetapp.accountsDefaultHiddenFromSidebar_v1";

function balanceLookup(
  rows: { name: string; balance: number }[],
  account: string,
): number | null {
  const hit = rows.find(
    (r) => r.name.toLowerCase() === account.toLowerCase(),
  );
  return hit != null ? hit.balance : null;
}

export default function AccountsClient() {
  const [serverAccounts, setServerAccounts] = useState<string[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [balanceRows, setBalanceRows] = useState<
    { name: string; balance: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletedAccountsOpen, setDeletedAccountsOpen] = useState(false);
  const manualAccounts = useManualAccounts();
  const deletedAccounts = useDeletedAccounts();
  const bumpBalances = useBumpAccountBalancesRefresh();
  const sidebarHidden = useBalanceSidebarHidden();
  const sidebarTotalExcluded = useBalanceSidebarTotalExcluded();
  const accountsSubcurrencyHidden = useAccountsSubcurrencyHidden();
  const currencySettings = useCurrencySettings();
  const currencyConversion = useMemo(
    () => buildCurrencyConversionPayload(currencySettings),
    [currencySettings],
  );
  const fmtMoney = useCallback(
    (n: number) => formatMainCurrencyTotal(n, currencySettings),
    [currencySettings],
  );

  const displayAccounts = useMemo(
    () =>
      computeDisplayAccountNames(serverAccounts, manualAccounts, deletedAccounts),
    [serverAccounts, manualAccounts, deletedAccounts],
  );

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return displayAccounts;
    return displayAccounts.filter((a) => a.toLowerCase().includes(q));
  }, [displayAccounts, searchQuery]);

  const deletedSorted = useMemo(
    () =>
      [...deletedAccounts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [deletedAccounts],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = await getWorkbook();
      const sheet = w.sheets[0]?.name ?? null;
      const labels = await getBudgetLabels();
      setServerAccounts(labels.accounts);
      setCurrencies(labels.currencies);
      if (sheet) {
        const balRes = await getAccountBalances(
          sheet,
          currencyConversion ?? undefined,
        );
        setBalanceRows(balRes.accounts);
      } else {
        setBalanceRows([]);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not load labels. Is the API running and DATABASE_URL set?",
      );
    } finally {
      setLoading(false);
    }
  }, [currencyConversion]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One-time: balance sidebar used to show all accounts by default; opt-in to show instead. */
  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SIDEBAR_DEFAULT_HIDDEN_KEY) === "1") return;
    if (displayAccounts.length === 0) return;
    hideAllBalanceSidebarAccounts([...displayAccounts]);
    localStorage.setItem(SIDEBAR_DEFAULT_HIDDEN_KEY, "1");
  }, [loading, displayAccounts]);

  function canonicalServerLabel(label: string): string | null {
    const found = serverAccounts.find(
      (s) => s.toLowerCase() === label.toLowerCase(),
    );
    return found ?? null;
  }

  function addAccount() {
    const t = addDraft.trim();
    if (!t) return;
    addManualAccount(t);
    setBalanceSidebarAccountShown(t, false);
    setAddDraft("");
  }

  function softDeleteAccount(label: string) {
    const onServer = canonicalServerLabel(label);
    const manualOnly = onServer == null;
    const storedName = (onServer ?? label).trim();
    if (!storedName) return;
    if (manualOnly) {
      const man = manualAccounts.find(
        (m) => m.toLowerCase() === label.toLowerCase(),
      );
      if (man) removeManualAccount(man);
    }
    addDeletedAccount(storedName, manualOnly);
  }

  function restoreAccount(entry: DeletedAccountEntry) {
    removeDeletedAccount(entry.name);
    if (entry.manualOnly) {
      addManualAccount(entry.name);
    }
    setBalanceSidebarAccountShown(entry.name, false);
  }

  async function deleteCurrency(label: string) {
    const key = `c:${label}`;
    setBusyKey(key);
    setError(null);
    try {
      await removeBudgetCurrencyLabel(label);
      setCurrencies((prev) => prev.filter((x) => x !== label));
      bumpBalances();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to clear currency on transactions.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  const beginEdit = (label: string) => {
    setEditingAccount(label);
    setEditDraft(label);
  };

  const cancelEdit = () => {
    setEditingAccount(null);
    setEditDraft("");
  };

  async function saveRename(oldLabel: string) {
    const next = editDraft.trim();
    if (!next) {
      setError("Name is required");
      return;
    }
    if (next === oldLabel) {
      cancelEdit();
      return;
    }
    setRenameBusy(true);
    setError(null);
    try {
      await renameBudgetAccountLabel(oldLabel, next);
      applyAccountLabelRenameEverywhere(oldLabel, next);
      cancelEdit();
      await load();
      bumpBalances();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename account");
    } finally {
      setRenameBusy(false);
    }
  }

  const btnRestore =
    "shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-900/50";

  return (
    <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 pb-28 py-4 sm:px-4">
      <header className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Accounts &amp; currencies
        </h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          Remove sends an account to <strong className="font-medium">Deleted accounts</strong>{" "}
          (transactions unchanged). By default, accounts are{" "}
          <strong className="font-medium">hidden</strong> from the balance sidebar until you choose{" "}
          <strong className="font-medium">Show</strong>.{" "}
          <strong className="font-medium">Exclude from total</strong> keeps the account in the sidebar but
          omits it from the combined total (shown in grey). Click a name to rename.
        </p>
      </header>

      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-xs text-zinc-800 dark:text-zinc-200">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-950/50 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-4">
              <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Add account
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="Account name…"
                  value={addDraft}
                  onChange={(e) => setAddDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAccount();
                    }
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="shrink-0 rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  disabled={!addDraft.trim()}
                  onClick={addAccount}
                >
                  Add
                </button>
              </div>
            </div>
            <label className="lg:col-span-4">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Search
              </span>
              <input
                type="search"
                className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="Filter accounts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search accounts"
                autoComplete="off"
              />
            </label>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Accounts
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Balance from the first workbook sheet. Up to five cards per row on wide screens.
              </p>
            </div>
            {displayAccounts.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No active account names. Add one above, restore from deleted, or enter values in the
                workbook.
              </p>
            ) : filteredAccounts.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No accounts match &quot;{searchQuery.trim()}&quot;.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredAccounts.map((a) => {
                  const shownInSidebar = isAccountShownInBalanceSidebar(
                    sidebarHidden,
                    a,
                  );
                  const excludedFromTotal = isAccountExcludedFromBalanceTotal(
                    sidebarTotalExcluded,
                    a,
                  );
                  const bal = balanceLookup(balanceRows, a);
                  const isEditing = editingAccount === a;
                  return (
                    <li
                      key={a}
                      className={`flex min-h-[9.5rem] flex-col rounded-lg border p-2 dark:border-zinc-800 ${
                        shownInSidebar
                          ? "border-zinc-200 bg-zinc-50/80 dark:bg-zinc-900/40"
                          : "border-dashed border-zinc-300 bg-zinc-100/60 dark:border-zinc-600 dark:bg-zinc-900/60"
                      }`}
                    >
                      {isEditing ? (
                        <div
                          className="flex min-w-0 flex-col gap-2"
                          data-account-edit-wrap=""
                        >
                          <input
                            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            disabled={renameBusy}
                            autoFocus
                            aria-label="Account name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveRename(a);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            onBlur={(e) => {
                              if (renameBusy) return;
                              const rt = e.relatedTarget as Node | null;
                              const wrap = e.currentTarget.closest(
                                "[data-account-edit-wrap]",
                              );
                              if (rt && wrap?.contains(rt)) return;
                              cancelEdit();
                            }}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                              disabled={renameBusy || !editDraft.trim()}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => void saveRename(a)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                              disabled={renameBusy}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => cancelEdit()}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="min-h-[2.75rem] w-full rounded-lg border border-zinc-100 bg-white px-2 py-2 text-left text-sm font-medium text-zinc-800 transition hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                          title={`Edit “${a || "(empty)"}”`}
                          onClick={() => beginEdit(a)}
                        >
                          <span className="line-clamp-2 break-words">{a || "(empty)"}</span>
                        </button>
                      )}
                      <p
                        className={`mt-2 text-right text-lg font-semibold tabular-nums ${
                          bal != null && bal < 0
                            ? "text-rose-700 dark:text-rose-400"
                            : "text-zinc-900 dark:text-zinc-50"
                        }`}
                      >
                        {bal != null ? fmtMoney(bal) : "—"}
                      </p>
                      {!isEditing && (
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                          <button
                            type="button"
                            title={
                              shownInSidebar
                                ? "Hide from balance sidebar"
                                : "Show in balance sidebar"
                            }
                            onClick={() =>
                              setBalanceSidebarAccountShown(a, !shownInSidebar)
                            }
                            className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              !shownInSidebar
                                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {!shownInSidebar ? "Show" : "Hide"}
                          </button>
                          <button
                            type="button"
                            title={
                              excludedFromTotal
                                ? "Include this account in the sidebar combined total"
                                : "Exclude from the sidebar combined total (grey in sidebar)"
                            }
                            onClick={() =>
                              setAccountExcludedFromBalanceTotal(a, !excludedFromTotal)
                            }
                            className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              excludedFromTotal
                                ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {excludedFromTotal ? "Include in total" : "Exclude from total"}
                          </button>
                          <button
                            type="button"
                            title="Remove from active list (soft delete)"
                            onClick={() => softDeleteAccount(a)}
                            className="shrink-0 rounded-md bg-red-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            {deletedSorted.length === 0 ? (
              <>
                <div>
                  <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                    Deleted accounts
                  </h2>
                  <p className="mt-1 text-xs text-zinc-800 dark:text-zinc-200">
                    No deleted accounts.
                  </p>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-3 py-2.5 text-left transition hover:bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70"
                  aria-expanded={deletedAccountsOpen}
                  onClick={() => setDeletedAccountsOpen((o) => !o)}
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      Deleted accounts
                    </h2>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-200/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      {deletedSorted.length}
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {deletedAccountsOpen ? "Hide list" : "Show list"}
                    </span>
                  </div>
                  <svg
                    className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400 ${
                      deletedAccountsOpen ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {deletedAccountsOpen ? (
                  <>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Restore brings the name back to your active list. Your transactions are
                      unchanged.
                    </p>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {deletedSorted.map((entry) => {
                        const bal = balanceLookup(balanceRows, entry.name);
                        return (
                          <li
                            key={entry.name}
                            className="flex min-h-[9.5rem] flex-col rounded-lg border border-dashed border-zinc-300 bg-zinc-100/60 p-2 dark:border-zinc-600 dark:bg-zinc-900/60"
                          >
                            <div className="min-h-[2.75rem] rounded-lg border border-zinc-100 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                              <span className="line-clamp-2 break-words text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                {entry.name}
                              </span>
                            </div>
                            <p
                              className={`mt-2 text-right text-lg font-semibold tabular-nums ${
                                bal != null && bal < 0
                                  ? "text-rose-700 dark:text-rose-400"
                                  : "text-zinc-900 dark:text-zinc-50"
                              }`}
                            >
                              {bal != null ? fmtMoney(bal) : "—"}
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                              <button
                                type="button"
                                className={btnRestore}
                                onClick={() => restoreAccount(entry)}
                              >
                                Restore
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Configured subcurrencies
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                From Settings → Currency display &amp; conversion.{" "}
                <strong className="font-medium text-zinc-600 dark:text-zinc-300">Hide</strong> removes a
                code from the transaction Currency suggestions (you can still edit rows that already use
                it).
              </p>
            </div>
            {currencySettings.subcurrencies.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No subcurrencies configured. Add codes and rates under Settings.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {currencySettings.subcurrencies
                  .filter((s) => normalizeCurrencyCode(s.code.trim()))
                  .map((s, idx) => {
                  const codeRaw = s.code.trim();
                  const codeNorm = normalizeCurrencyCode(codeRaw);
                  const mainNorm = normalizeCurrencyCode(currencySettings.mainCode);
                  const isMain = codeNorm === mainNorm;
                  const shownInPicker = isConfiguredSubcurrencyShownInLists(
                    accountsSubcurrencyHidden,
                    codeNorm,
                  );
                  const rateLabel = Number.isFinite(s.rateToMain)
                    ? `1 ${codeNorm} = ${s.rateToMain} ${mainNorm || currencySettings.mainCode.trim() || "main"}`
                    : "—";
                  return (
                    <li
                      key={`subcur-${idx}-${codeNorm}`}
                      className={`flex min-h-[9.5rem] flex-col rounded-lg border p-2 dark:border-zinc-800 ${
                        shownInPicker
                          ? "border-zinc-200 bg-zinc-50/80 dark:bg-zinc-900/40"
                          : "border-dashed border-zinc-300 bg-zinc-100/60 dark:border-zinc-600 dark:bg-zinc-900/60"
                      }`}
                    >
                      <div className="min-h-[2.75rem] rounded-lg border border-zinc-100 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                        <span className="line-clamp-2 break-words text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {codeRaw || "(empty)"}
                        </span>
                      </div>
                      <p className="mt-2 flex-1 text-right text-xs tabular-nums leading-snug text-zinc-600 dark:text-zinc-400">
                        {isMain ? "Same as main (no conversion)" : rateLabel}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                        <button
                          type="button"
                          title={
                            shownInPicker
                              ? "Hide from transaction Currency suggestions"
                              : "Show in transaction Currency suggestions"
                          }
                          onClick={() =>
                            setAccountsSubcurrencyShown(codeNorm, !shownInPicker)
                          }
                          className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                            !shownInPicker
                              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/50"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {!shownInPicker ? "Show" : "Hide"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                Currencies
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Distinct values in the Currency column. Same card layout as accounts (up to five per
                row on wide screens).
              </p>
            </div>
            {currencies.length === 0 ? (
              <p className="text-xs text-zinc-800 dark:text-zinc-200">
                No currency codes in the workbook.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {currencies.map((c) => (
                  <li
                    key={c}
                    className="flex min-h-[9.5rem] flex-col rounded-lg border border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="min-h-[2.75rem] rounded-lg border border-zinc-100 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                      <span className="line-clamp-2 break-words text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {c || "(empty)"}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-right text-lg font-semibold tabular-nums text-zinc-300 dark:text-zinc-600">
                      —
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                      <button
                        type="button"
                        title="Clear this currency on all matching transaction rows"
                        className="shrink-0 rounded-md bg-red-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                        disabled={busyKey === `c:${c}`}
                        onClick={() => void deleteCurrency(c)}
                      >
                        {busyKey === `c:${c}` ? "…" : "Delete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
