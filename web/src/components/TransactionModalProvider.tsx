"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  Suspense,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createCategoryCatalog,
  createSubcategoryCatalog,
  createTransaction,
  DEFAULT_WORKBOOK_SHEET,
  deleteTransaction,
  getCategoryCatalog,
  getWorkbookFacet,
  updateTransaction,
  type CategoryCatalogEntry,
  type TransactionPayload,
} from "@/lib/api";
import {
  TxAddFieldPickerModal,
  TxAddFieldTriggerButton,
} from "@/components/TxAddFieldPickers";
import { PeriodDateTimeInputs } from "@/components/PeriodDateTimeInputs";
import { FacetAutocomplete } from "@/components/FacetAutocomplete";
import { useVisibleAccountNames } from "@/lib/useVisibleAccountNames";
import { useAccountExplore } from "@/lib/accountExploreContext";
import { useBumpAccountBalancesRefresh } from "@/lib/accountBalancesRefreshContext";
import { useWorkbookActiveSheetOptional } from "@/lib/workbookActiveSheetContext";
import {
  defaultTransactionPeriodLocal,
  isoToDatetimeLocal,
  localToTimestamp,
  transactionPeriodLocalForDate,
} from "@/lib/datetimeLocal";
import {
  TRANSACTIONS_CHANGED_EVENT,
  subscribeTransactionsChangedDebounced,
} from "@/lib/transactionsChanged";
import { evaluateAmountExpression, parseFormNumber } from "@/lib/parseFormNumber";
import {
  catalogCategoriesForTransactionKind,
  subcategoryNamesForCategory,
  txKindFromIncomeExpenseCell,
} from "@/lib/categoryCatalog";
import { isReservedCategoryLabel } from "@/lib/reservedCategory";
import { getTransactionRowId } from "@/lib/transactionRowId";
import { parseTransferAccountsFromRow } from "@/lib/transferRowAccounts";
import { transferMoneyTextClass } from "@/lib/transactionRowTone";
import {
  isConfiguredSubcurrencyShownInLists,
  useAccountsSubcurrencyHidden,
} from "@/lib/accountsSubcurrencyVisibility";
import {
  getAccountOrder,
  mergeOrderAfterPickerReorder,
  setAccountOrder,
} from "@/lib/accountOrder";
import { applyNameOrder } from "@/lib/stringListOrder";
import {
  setTxModalCategoryOrder,
  setTxModalSubcategoryOrderForCategory,
  useTxModalPickerOrder,
} from "@/lib/txModalPickerOrder";
import {
  normalizeCurrencyCode,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { txModalIncomeSelectedClass } from "@/lib/incomeExpenseTheme";
import {
  btnDangerOutline,
  btnPrimary,
  btnSecondary,
  fieldLabelText,
  inputClass,
  modalBackdrop,
  modalPanel,
  modalTitle,
} from "@/lib/ui";

export { TRANSACTIONS_CHANGED_EVENT };

function dispatchTransactionsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TRANSACTIONS_CHANGED_EVENT));
}

type TxFieldPicker =
  | null
  | "accounts"
  | "transferFrom"
  | "transferTo"
  | "category"
  | "subcategory"
  | "currency";

type TxModalContextValue = {
  txModalOpen: boolean;
  openTxCreate: (opts?: {
    /** Full `datetime-local` string; wins over `date`. */
    period?: string;
    /** `YYYY-MM-DD` only; time uses current local clock (like dashboard default). */
    date?: string;
  }) => void;
  openTxEdit: (row: Record<string, unknown>) => void;
  closeTxModal: () => void;
};

const TxModalContext = createContext<TxModalContextValue | null>(null);

export function useTransactionModal(): TxModalContextValue {
  const ctx = useContext(TxModalContext);
  if (!ctx) {
    throw new Error("useTransactionModal must be used within TransactionModalProvider");
  }
  return ctx;
}

function trimOrNull(s: string) {
  const t = s.trim();
  return t.length ? t : null;
}

/** Opens add-tx from `/?addTx=1` on the home (calendar) route (requires Suspense parent). */
function AddTxQuerySync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openTxCreate } = useTransactionModal();

  useEffect(() => {
    if (pathname !== "/") return;
    if (searchParams.get("addTx") !== "1") return;
    const rawDate = searchParams.get("date");
    let opts: { period?: string; date?: string } | undefined;
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
      opts = { date: rawDate.trim() };
    }
    openTxCreate(opts);
    router.replace(pathname, { scroll: false });
  }, [pathname, searchParams, router, openTxCreate]);

  return null;
}

export function TransactionModalProvider({ children }: { children: ReactNode }) {
  const accountExplore = useAccountExplore();
  const sheetCtx = useWorkbookActiveSheetOptional();
  const bumpAccountBalancesRefresh = useBumpAccountBalancesRefresh();
  const currencySettings = useCurrencySettings();
  const accountsSubcurrencyHidden = useAccountsSubcurrencyHidden();

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txCategoryCatalog, setTxCategoryCatalog] = useState<CategoryCatalogEntry[]>(
    [],
  );
  const [txEditingId, setTxEditingId] = useState<number | null>(null);
  const [txFieldPicker, setTxFieldPicker] = useState<TxFieldPicker>(null);
  /** Category picker: after choosing a category with catalog subcategories, show subs in the same modal. */
  const [categoryPickerPhase, setCategoryPickerPhase] = useState<
    "categories" | "subcategories"
  >("categories");
  const [categoryPickerParent, setCategoryPickerParent] = useState("");
  const [txSaving, setTxSaving] = useState(false);
  const [txSaveError, setTxSaveError] = useState<string | null>(null);
  const [txForm, setTxForm] = useState({
    kind: "expense" as "expense" | "income" | "transfer",
    transferTo: "",
    transferFee: "",
    period: "",
    accounts: "",
    category: "",
    subcategory: "",
    note: "",
    income_expense: "",
    description: "",
    amount: "",
    currency: "",
  });

  useEffect(() => {
    if (!txModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getCategoryCatalog();
        if (!cancelled) setTxCategoryCatalog(r.categories);
      } catch {
        if (!cancelled) setTxCategoryCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txModalOpen]);

  useEffect(() => {
    if (txFieldPicker !== "category") {
      setCategoryPickerPhase("categories");
      setCategoryPickerParent("");
    }
  }, [txFieldPicker]);

  const txCategoryCatalogForKind = useMemo(
    () => catalogCategoriesForTransactionKind(txCategoryCatalog, txForm.kind),
    [txCategoryCatalog, txForm.kind],
  );

  const txSubcategoryStaticOptions = useMemo(
    () =>
      subcategoryNamesForCategory(txCategoryCatalogForKind, txForm.category),
    [txCategoryCatalogForKind, txForm.category],
  );

  const txModalPickerOrder = useTxModalPickerOrder();

  const txCatalogCategoryNames = useMemo(
    () =>
      [...txCategoryCatalogForKind]
        .filter((c) => c.is_hidden !== true && !isReservedCategoryLabel(c.name))
        .map((c) => c.name),
    [txCategoryCatalogForKind],
  );

  const txAddCategoryOptions = useMemo(
    () =>
      applyNameOrder(txCatalogCategoryNames, txModalPickerOrder.categories),
    [txCatalogCategoryNames, txModalPickerOrder.categories],
  );

  const txSubcategoryOrdered = useMemo(
    () =>
      applyNameOrder(
        txSubcategoryStaticOptions,
        txForm.category.trim()
          ? txModalPickerOrder.subcategories[
              txForm.category.trim().toLowerCase()
            ] ?? []
          : [],
      ),
    [
      txSubcategoryStaticOptions,
      txForm.category,
      txModalPickerOrder.subcategories,
    ],
  );

  const onTxCategoryChange = useCallback(
    (v: string) => {
      setTxForm((f) => {
        const allowed = subcategoryNamesForCategory(txCategoryCatalogForKind, v);
        const sub = f.subcategory.trim();
        const clearSub =
          allowed.length > 0 &&
          sub !== "" &&
          !allowed.some((s) => s.toLowerCase() === sub.toLowerCase());
        return {
          ...f,
          category: v,
          ...(clearSub ? { subcategory: "" } : {}),
        };
      });
    },
    [txCategoryCatalogForKind],
  );

  const commitAmountExpression = useCallback(() => {
    setTxForm((f) => {
      const next = evaluateAmountExpression(f.amount);
      if (next === null) return f;
      return { ...f, amount: next };
    });
  }, []);

  const commitTransferFeeExpression = useCallback(() => {
    setTxForm((f) => {
      const next = evaluateAmountExpression(f.transferFee);
      if (next === null) return f;
      return { ...f, transferFee: next };
    });
  }, []);

  const addCategoryFromPicker = useCallback(
    async (name: string) => {
      const t = name.trim();
      if (isReservedCategoryLabel(t)) {
        throw new Error("That name is reserved for system use.");
      }
      const kind = txForm.kind === "income" ? "income" : "expense";
      await createCategoryCatalog(t, kind);
      const r = await getCategoryCatalog();
      setTxCategoryCatalog(r.categories);
    },
    [txForm.kind],
  );

  const addSubcategoryFromPicker = useCallback(
    async (name: string) => {
      const catName = txForm.category.trim();
      if (!catName) {
        throw new Error("Choose a category first.");
      }
      const entry = txCategoryCatalog.find(
        (c) => c.name.trim().toLowerCase() === catName.toLowerCase(),
      );
      if (!entry) {
        throw new Error(
          "Add this category under Category first (use “Add new” there).",
        );
      }
      await createSubcategoryCatalog(entry.id, name.trim());
      const r = await getCategoryCatalog();
      setTxCategoryCatalog(r.categories);
    },
    [txForm.category, txCategoryCatalog],
  );

  const closeTxModal = useCallback(() => {
    setTxModalOpen(false);
    setTxFieldPicker(null);
    setTxSaveError(null);
  }, []);

  const openTxCreate = useCallback(
    (opts?: { period?: string; date?: string }) => {
      setTxEditingId(null);
      const trimmedPeriod = opts?.period?.trim();
      const trimmedDate = opts?.date?.trim();
      let local: string;
      if (trimmedPeriod) {
        local = trimmedPeriod;
      } else if (trimmedDate && /^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        local = transactionPeriodLocalForDate(trimmedDate);
      } else {
        local = defaultTransactionPeriodLocal();
      }
      const drillAcc = accountExplore?.accountDrillDown;
      const accountsPrefill = drillAcc != null ? drillAcc : "";
      setTxForm({
        kind: "expense",
        transferTo: "",
        transferFee: "",
        period: local,
        accounts: accountsPrefill,
        category: "",
        subcategory: "",
        note: "",
        income_expense: "",
        description: "",
        amount: "",
        currency: "",
      });
      setTxFieldPicker(null);
      setTxSaveError(null);
      setTxModalOpen(true);
    },
    [accountExplore?.accountDrillDown],
  );

  const openTxEdit = useCallback((row: Record<string, unknown>) => {
    const numId = getTransactionRowId(row);
    if (numId == null) return;
    setTxEditingId(numId);
    const g = (k: string) =>
      row[k] == null || row[k] === "" ? "" : String(row[k]);
    const gNum = (k: string) => {
      const v = row[k];
      if (v == null || v === "") return "";
      return typeof v === "number" ? String(v) : String(v);
    };
    const periodLocal = isoToDatetimeLocal(g("Period"));
    const kind = txKindFromIncomeExpenseCell(g("Income/Expense"));
    let accountsVal = g("Accounts");
    let transferToVal = "";
    if (kind === "transfer") {
      const { fromAccount, toAccount } = parseTransferAccountsFromRow(row);
      accountsVal = fromAccount;
      const parsedTo = toAccount.trim();
      const categoryCell = g("Category").trim();
      // Destination is normally parsed from Description; if missing, some rows store it in Category.
      transferToVal = parsedTo || categoryCell;
    }
    setTxForm({
      kind,
      transferTo: transferToVal,
      transferFee: "",
      period: periodLocal,
      accounts: accountsVal,
      category: kind === "transfer" ? "" : g("Category"),
      subcategory: kind === "transfer" ? "" : g("Subcategory"),
      note: g("Note"),
      income_expense: g("Income/Expense"),
      description: g("Description"),
      amount: gNum("Amount"),
      currency: g("Currency"),
    });
    setTxFieldPicker(null);
    setTxSaveError(null);
    setTxModalOpen(true);
  }, []);

  const buildTxUpdatePayload = useCallback((): TransactionPayload => {
    const isTransfer =
      txKindFromIncomeExpenseCell(txForm.income_expense || "") === "transfer";
    const body: TransactionPayload = {
      accounts: trimOrNull(txForm.accounts),
      ...(!isTransfer
        ? {
            category: trimOrNull(txForm.category),
            subcategory: trimOrNull(txForm.subcategory),
          }
        : {}),
      note: trimOrNull(txForm.note),
      income_expense: trimOrNull(txForm.income_expense),
      description: trimOrNull(txForm.description),
      amount: parseFormNumber(txForm.amount),
      currency: trimOrNull(txForm.currency),
      period: txForm.period?.trim()
        ? new Date(localToTimestamp(txForm.period.trim())).toISOString()
        : null,
    };
    if (txKindFromIncomeExpenseCell(txForm.income_expense || "") === "transfer") {
      const ie = (txForm.income_expense || "").toLowerCase();
      const fromA = trimOrNull(txForm.accounts);
      const toA = trimOrNull(txForm.transferTo);
      if (ie.includes("transfer-out")) {
        if (fromA != null) body.accounts = fromA;
        if (toA) body.description = `Transfer to ${toA}`;
      } else if (ie.includes("transfer-in")) {
        if (toA != null) body.accounts = toA;
        if (fromA) body.description = `Transfer from ${fromA}`;
      }
    }
    return body;
  }, [txForm]);

  const buildTxCreatePayload = useCallback((): TransactionPayload => {
    if (txForm.kind === "transfer") {
      const fee = parseFormNumber(txForm.transferFee);
      return {
        kind: "transfer",
        period: txForm.period
          ? new Date(localToTimestamp(txForm.period)).toISOString()
          : null,
        accounts: trimOrNull(txForm.accounts),
        note: trimOrNull(txForm.note),
        description: trimOrNull(txForm.description),
        amount: parseFormNumber(txForm.amount),
        currency: trimOrNull(txForm.currency),
        transfer_to_account: trimOrNull(txForm.transferTo),
        ...(fee != null && fee > 0 ? { transfer_fee: fee } : {}),
      };
    }
    return {
      kind: txForm.kind,
      period: txForm.period
        ? new Date(localToTimestamp(txForm.period)).toISOString()
        : null,
      accounts: trimOrNull(txForm.accounts),
      category: trimOrNull(txForm.category),
      subcategory: trimOrNull(txForm.subcategory),
      note: trimOrNull(txForm.note),
      description: trimOrNull(txForm.description),
      amount: parseFormNumber(txForm.amount),
      currency: trimOrNull(txForm.currency),
    };
  }, [txForm]);

  const submitTransaction = useCallback(async () => {
    setTxSaving(true);
    setTxSaveError(null);
    try {
      if (txEditingId != null) {
        await updateTransaction(txEditingId, buildTxUpdatePayload());
      } else {
        await createTransaction(buildTxCreatePayload());
      }
      closeTxModal();
      setTxEditingId(null);
      bumpAccountBalancesRefresh();
      dispatchTransactionsChanged();
    } catch (e) {
      setTxSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setTxSaving(false);
    }
  }, [
    txEditingId,
    buildTxUpdatePayload,
    buildTxCreatePayload,
    closeTxModal,
    bumpAccountBalancesRefresh,
  ]);

  const deleteEditingTransaction = useCallback(async () => {
    if (txEditingId == null) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this transaction?")
    )
      return;
    setTxSaveError(null);
    setTxSaving(true);
    try {
      await deleteTransaction(txEditingId);
      closeTxModal();
      setTxEditingId(null);
      bumpAccountBalancesRefresh();
      dispatchTransactionsChanged();
    } catch (e) {
      setTxSaveError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setTxSaving(false);
    }
  }, [txEditingId, closeTxModal, bumpAccountBalancesRefresh]);

  const txFacetSheet = sheetCtx?.activeSheet ?? DEFAULT_WORKBOOK_SHEET;
  const visibleAccountOptions = useVisibleAccountNames(txFacetSheet, txModalOpen);

  const txAddAccountOptionsMerged = useMemo(() => {
    const base = [...visibleAccountOptions];
    const a = txForm.accounts.trim();
    const t = txForm.transferTo.trim();
    let out = base;
    if (a && !out.includes(a)) out = [a, ...out];
    if (t && !out.includes(t)) out = [t, ...out];
    return out;
  }, [visibleAccountOptions, txForm.accounts, txForm.transferTo]);

  const txAddCategoryOptionsMerged = useMemo(() => {
    const names = [...txAddCategoryOptions];
    const cur = txForm.category.trim();
    if (!cur) return names;
    if (names.some((n) => n.toLowerCase() === cur.toLowerCase())) return names;
    return [cur, ...names];
  }, [txAddCategoryOptions, txForm.category]);

  const txAddSubcategoryOptionsMerged = useMemo(() => {
    const names = [...txSubcategoryOrdered];
    const cur = txForm.subcategory.trim();
    if (!cur) return names;
    if (names.some((n) => n.toLowerCase() === cur.toLowerCase())) return names;
    return [cur, ...names];
  }, [txSubcategoryOrdered, txForm.subcategory]);

  const [txCurrencyFacetOpts, setTxCurrencyFacetOpts] = useState<string[]>([]);

  useEffect(() => {
    if (!txModalOpen) {
      setTxCurrencyFacetOpts([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      getWorkbookFacet("Currency", { limit: 160, sort: "alpha" })
        .then((r) => {
          if (cancelled || r.kind === "datetime") return;
          setTxCurrencyFacetOpts(r.items.map((x) => x.value));
        })
        .catch(() => {
          if (!cancelled) setTxCurrencyFacetOpts([]);
        });
    };
    load();
    const unsub = subscribeTransactionsChangedDebounced(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [txModalOpen]);

  const txCurrencyStaticOptionsMerged = useMemo(() => {
    const main = normalizeCurrencyCode(currencySettings.mainCode);
    const curVal = txForm.currency.trim();
    const curNorm = normalizeCurrencyCode(curVal);

    const skipUnlessEditing = (codeNorm: string): boolean => {
      if (!codeNorm) return false;
      const configured = currencySettings.subcurrencies.some(
        (s) => normalizeCurrencyCode(s.code) === codeNorm,
      );
      if (!configured) return false;
      if (
        isConfiguredSubcurrencyShownInLists(accountsSubcurrencyHidden, codeNorm)
      ) {
        return false;
      }
      return curNorm !== codeNorm;
    };

    const seen = new Set<string>();
    const out: string[] = [];
    const add = (raw: string) => {
      const disp = String(raw).trim();
      const n = normalizeCurrencyCode(disp);
      if (!n) return;
      if (skipUnlessEditing(n)) return;
      const key = n.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(disp || n);
    };

    add(main);
    for (const s of currencySettings.subcurrencies) {
      add(s.code);
    }
    for (const f of txCurrencyFacetOpts) {
      add(f);
    }
    if (curVal && !seen.has(curNorm.toLowerCase())) {
      add(curVal);
    }
    out.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return out;
  }, [
    currencySettings.mainCode,
    currencySettings.subcurrencies,
    txCurrencyFacetOpts,
    txForm.currency,
    accountsSubcurrencyHidden,
  ]);

  const onPickerReorder = useCallback(
    (nextOrder: string[]) => {
      if (
        txFieldPicker === "accounts" ||
        txFieldPicker === "transferFrom" ||
        txFieldPicker === "transferTo"
      ) {
        setAccountOrder(
          mergeOrderAfterPickerReorder(nextOrder, getAccountOrder()),
        );
        return;
      }
      if (txFieldPicker === "category") {
        if (
          categoryPickerPhase === "subcategories" &&
          categoryPickerParent.trim()
        ) {
          setTxModalSubcategoryOrderForCategory(
            categoryPickerParent.trim().toLowerCase(),
            nextOrder,
          );
          return;
        }
        setTxModalCategoryOrder(nextOrder);
        return;
      }
      if (txFieldPicker === "subcategory") {
        const k = txForm.category.trim().toLowerCase();
        if (!k) return;
        setTxModalSubcategoryOrderForCategory(k, nextOrder);
      }
    },
    [
      txFieldPicker,
      txForm.category,
      categoryPickerPhase,
      categoryPickerParent,
    ],
  );

  const categoryPickerInSubDrill =
    txFieldPicker === "category" && categoryPickerPhase === "subcategories";

  const value = useMemo(
    (): TxModalContextValue => ({
      txModalOpen,
      openTxCreate,
      openTxEdit,
      closeTxModal,
    }),
    [txModalOpen, openTxCreate, openTxEdit, closeTxModal],
  );

  return (
    <TxModalContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <AddTxQuerySync />
      </Suspense>
      {txModalOpen && (
        <div className={modalBackdrop} role="presentation" onClick={closeTxModal}>
          <div
            className={modalPanel}
            role="dialog"
            aria-modal
            aria-labelledby="tx-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="tx-modal-title" className={modalTitle}>
              {txEditingId != null ? "Edit transaction" : "Add transaction"}
            </h3>
            {txSaveError && (
              <p
                className="mt-2 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {txSaveError}
              </p>
            )}
            {txEditingId == null && (
              <div className="mt-4">
                <p className={`mb-2 ${fieldLabelText}`}>Type</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["expense", "Expense"],
                      ["income", "Income"],
                      ["transfer", "Transfer to another account"],
                    ] as const
                  ).map(([k, label]) => {
                    const selected = txForm.kind === k;
                    const selectedTone =
                      k === "expense"
                        ? "border-rose-600 bg-rose-600 text-white shadow-sm dark:border-rose-500 dark:bg-rose-600"
                        : k === "income"
                          ? txModalIncomeSelectedClass
                          : "border-zinc-300 bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:border-zinc-500 dark:bg-white dark:text-zinc-900 dark:ring-zinc-600";
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={selected}
                        className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                          selected
                            ? selectedTone
                            : "border-zinc-300 bg-white text-zinc-800 hover:border-indigo-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-indigo-600 dark:hover:bg-zinc-800"
                        }`}
                        onClick={() =>
                          setTxForm((f) => ({
                            ...f,
                            kind: k,
                            transferTo: k !== "transfer" ? "" : f.transferTo,
                            transferFee: k !== "transfer" ? "" : f.transferFee,
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label
                className={`flex flex-col gap-1 sm:col-span-2 ${fieldLabelText}`}
              >
                Period
                <PeriodDateTimeInputs
                  idPrefix="tx-period"
                  value={txForm.period}
                  onChange={(period) =>
                    setTxForm((f) => ({ ...f, period }))
                  }
                />
              </label>
              {txForm.kind === "transfer" ? (
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <TxAddFieldTriggerButton
                        label="From account"
                        value={txForm.accounts}
                        placeholder="Select account…"
                        onOpen={() => setTxFieldPicker("transferFrom")}
                      />
                    </div>
                    <div
                      className={`flex shrink-0 justify-center py-1 text-lg font-semibold leading-none sm:pb-2 ${transferMoneyTextClass}`}
                      aria-hidden
                    >
                      →
                    </div>
                    <div className="min-w-0 flex-1">
                      <TxAddFieldTriggerButton
                        label="To account"
                        value={txForm.transferTo}
                        placeholder="Select account…"
                        onOpen={() => setTxFieldPicker("transferTo")}
                      />
                    </div>
                  </div>
                </div>
              ) : txEditingId != null ? (
                <>
                  <TxAddFieldTriggerButton
                    label="Accounts"
                    value={txForm.accounts}
                    placeholder="Select account…"
                    onOpen={() => setTxFieldPicker("accounts")}
                  />
                  <TxAddFieldTriggerButton
                    label="Category"
                    value={txForm.category}
                    placeholder="Select category…"
                    onOpen={() => setTxFieldPicker("category")}
                  />
                  <TxAddFieldTriggerButton
                    label="Subcategory"
                    value={txForm.subcategory}
                    placeholder="Select subcategory…"
                    onOpen={() => setTxFieldPicker("subcategory")}
                  />
                  <label
                    className={`flex flex-col gap-1 sm:col-span-2 ${fieldLabelText}`}
                  >
                    Income / Expense
                    <input
                      className={inputClass}
                      value={txForm.income_expense}
                      onChange={(e) =>
                        setTxForm((f) => ({
                          ...f,
                          income_expense: e.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <TxAddFieldTriggerButton
                    label="Accounts"
                    value={txForm.accounts}
                    placeholder="Select account…"
                    onOpen={() => setTxFieldPicker("accounts")}
                  />
                  <TxAddFieldTriggerButton
                    label="Category"
                    value={txForm.category}
                    placeholder="Select category…"
                    onOpen={() => setTxFieldPicker("category")}
                  />
                  <TxAddFieldTriggerButton
                    label="Subcategory"
                    value={txForm.subcategory}
                    placeholder="Select subcategory…"
                    onOpen={() => setTxFieldPicker("subcategory")}
                  />
                </>
              )}
              <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
                Amount
                <input
                  inputMode="decimal"
                  className={inputClass}
                  value={txForm.amount}
                  onChange={(e) =>
                    setTxForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  onBlur={() => commitAmountExpression()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitAmountExpression();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="e.g. 100.00-10.00"
                  aria-describedby="tx-amount-calc-hint"
                />
                <span
                  id="tx-amount-calc-hint"
                  className="font-normal text-[11px] text-zinc-500 dark:text-zinc-400"
                >
                  Use + and − in one field; press Enter or Tab to total.
                </span>
              </label>
              <TxAddFieldTriggerButton
                label="Currency (optional)"
                value={txForm.currency}
                placeholder="Select currency…"
                onOpen={() => setTxFieldPicker("currency")}
              />
              {txEditingId == null && txForm.kind === "transfer" && (
                <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
                  Transfer fee (optional)
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={txForm.transferFee}
                    onChange={(e) =>
                      setTxForm((f) => ({
                        ...f,
                        transferFee: e.target.value,
                      }))
                    }
                    onBlur={() => commitTransferFeeExpression()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitTransferFeeExpression();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="0"
                  />
                  <span className="font-normal text-[11px] text-zinc-500 dark:text-zinc-400">
                    Recorded as an expense on the from account.
                  </span>
                </label>
              )}
              <div className="sm:col-span-2">
                <FacetAutocomplete
                  sheet={txFacetSheet}
                  column="Note"
                  label="Note"
                  value={txForm.note}
                  onChange={(v) => setTxForm((f) => ({ ...f, note: v }))}
                />
              </div>
              <div className="sm:col-span-2">
                <FacetAutocomplete
                  sheet={txFacetSheet}
                  column="Description"
                  label="Description"
                  value={txForm.description}
                  onChange={(v) =>
                    setTxForm((f) => ({ ...f, description: v }))
                  }
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <div>
                {txEditingId != null && (
                  <button
                    type="button"
                    className={btnDangerOutline}
                    disabled={txSaving}
                    onClick={() => void deleteEditingTransaction()}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={closeTxModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={txSaving}
                  onClick={() => void submitTransaction()}
                >
                  {txSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {txModalOpen && txFieldPicker !== null && (
        <TxAddFieldPickerModal
          open
          key={
            txFieldPicker === "category"
              ? "category-picker"
              : txFieldPicker === "currency"
                ? "currency-picker"
                : txFieldPicker
          }
          title={
            txFieldPicker === "transferFrom"
              ? "From account"
              : txFieldPicker === "transferTo"
                ? "To account"
                : txFieldPicker === "currency"
                  ? "Currency (optional)"
                  : txFieldPicker === "category"
                    ? categoryPickerInSubDrill
                      ? `Subcategories — ${categoryPickerParent}`
                      : "Category"
                    : txFieldPicker === "subcategory"
                      ? "Subcategory"
                      : "Account"
          }
          options={
            txFieldPicker === "currency"
              ? txCurrencyStaticOptionsMerged
              : txFieldPicker === "category"
                ? categoryPickerInSubDrill
                  ? txAddSubcategoryOptionsMerged
                  : txAddCategoryOptionsMerged
                : txFieldPicker === "subcategory"
                  ? txAddSubcategoryOptionsMerged
                  : txAddAccountOptionsMerged
          }
          emptyMessage={
            txFieldPicker === "currency"
              ? "No currencies available."
              : txFieldPicker === "subcategory"
                ? txForm.category.trim()
                  ? "No subcategories for this category."
                  : "Choose a category first."
                : txFieldPicker === "category"
                  ? categoryPickerInSubDrill
                    ? "No subcategories for this category."
                    : "No categories in your catalog yet."
                  : undefined
          }
          onAddNew={
            txFieldPicker === "category"
              ? categoryPickerInSubDrill
                ? addSubcategoryFromPicker
                : addCategoryFromPicker
              : txFieldPicker === "subcategory"
                ? addSubcategoryFromPicker
                : undefined
          }
          addNewPlaceholder={
            txFieldPicker === "category"
              ? categoryPickerInSubDrill
                ? "New subcategory name"
                : "New category name"
              : txFieldPicker === "subcategory"
                ? "New subcategory name"
                : undefined
          }
          includeNoneOption={
            txFieldPicker === "category" ||
            txFieldPicker === "subcategory" ||
            txFieldPicker === "currency"
          }
          reorderable={
            txFieldPicker === "accounts" ||
            txFieldPicker === "transferFrom" ||
            txFieldPicker === "transferTo" ||
            (txFieldPicker === "category" && !categoryPickerInSubDrill) ||
            (txFieldPicker === "category" &&
              categoryPickerInSubDrill &&
              txForm.category.trim() !== "") ||
            (txFieldPicker === "subcategory" &&
              txForm.category.trim() !== "")
          }
          onReorder={onPickerReorder}
          onBack={
            categoryPickerInSubDrill
              ? () => {
                  setCategoryPickerPhase("categories");
                  setCategoryPickerParent("");
                }
              : undefined
          }
          onClose={() => setTxFieldPicker(null)}
          onSelect={(v) => {
            if (txFieldPicker === "currency") {
              setTxForm((f) => ({ ...f, currency: v }));
              return;
            }
            if (
              txFieldPicker === "accounts" ||
              txFieldPicker === "transferFrom"
            ) {
              setTxForm((f) => ({ ...f, accounts: v }));
              return;
            }
            if (txFieldPicker === "transferTo") {
              setTxForm((f) => ({ ...f, transferTo: v }));
              return;
            }
            if (txFieldPicker === "category" && categoryPickerInSubDrill) {
              setTxForm((f) => ({ ...f, subcategory: v }));
              return;
            }
            if (txFieldPicker === "category") {
              const subs = subcategoryNamesForCategory(
                txCategoryCatalogForKind,
                v,
              );
              onTxCategoryChange(v);
              if (subs.length > 0) {
                setCategoryPickerPhase("subcategories");
                setCategoryPickerParent(v);
                return false;
              }
              return;
            }
            if (txFieldPicker === "subcategory") {
              setTxForm((f) => ({ ...f, subcategory: v }));
              return;
            }
          }}
        />
      )}
    </TxModalContext.Provider>
  );
}
