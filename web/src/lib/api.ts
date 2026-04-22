import { tryWasmApiFetch } from "@/lib/wasm/wasmRoutes";

/** API origin (FastAPI) or same-origin base for GitHub Pages + sql.js WASM. */
export function dataApiBase(): string {
  if (
    process.env.NEXT_PUBLIC_USE_WASM_SQLITE === "1" &&
    typeof window !== "undefined"
  ) {
    const bp = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    return `${window.location.origin}${bp}`;
  }
  const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  return rawApi && rawApi.length > 0
    ? rawApi.replace(/\/$/, "")
    : "http://127.0.0.1:8000";
}

/** Thin wrapper around `fetch` (single place to extend with shared headers if needed). */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const w = await tryWasmApiFetch(input, init);
  if (w) return w;
  return fetch(input, init);
}

/** Logical tab name from `/api/workbook` (backend `WORKBOOK_SHEET_KEY`, default `Budget`). */
export const DEFAULT_WORKBOOK_SHEET = "Budget";

export type ColumnMeta = { name: string; kind: string; unique_values: number };

export type FilterOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startswith"
  | "in"
  | "nin"
  | "isnull"
  | "notnull"
  /** Income/Expense column only; `"expense"` | `"income"` | `"transfer"` (matches dashboard preview tabs). */
  | "ie_segment";

export type FilterRow = { column: string; op: FilterOp; value: string };

export type CurrencyConversionPayload = {
  main_code: string;
  sub_rates: Record<string, number>;
};

export type AnalyzeBody = {
  /** Omit or empty — uses the default sheet from PostgreSQL. */
  sheet?: string;
  filters: { column: string; op: FilterOp; value?: unknown }[];
  sort?: { column: string; direction: "asc" | "desc" };
  page: number;
  /** `0` = return all matching rows (no pagination). */
  page_size: number;
  group_by?: string[];
  measures?: { column: string; agg: "sum" | "mean" | "min" | "max" | "count" }[];
  /** Match rows where any column contains this text (case-insensitive). */
  search_all?: string | null;
  /** Scale amounts to main currency for budget_totals (sub_rates multiply row amount). */
  currency_conversion?: CurrencyConversionPayload | null;
};

/** Income / expense / transfer totals for the filtered row set (same rules as Calendar). */
export type BudgetTotals = {
  available: boolean;
  amount_column: string | null;
  income_expense_column: string | null;
  total_income: number | null;
  total_expense: number | null;
  total_transfer_in: number | null;
  total_transfer_out: number | null;
  net_income_minus_expense: number | null;
};

export type AnalyzeResponse = {
  file: string;
  sheet: string;
  total_filtered_rows: number;
  numeric_summary: Record<string, Record<string, number>>;
  budget_totals: BudgetTotals;
  columns: string[];
  rows: Record<string, unknown>[];
  page: number;
  page_size: number;
  groups: Record<string, unknown>[] | null;
};

/** FastAPI returns `{ "detail": "..." }` or validation `{ "detail": [{ "msg": "..." }] }`. */
function messageFromErrorResponseBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null) return trimmed;
    const o = parsed as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    if (Array.isArray(o.detail)) {
      const parts = o.detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            return String((item as { msg?: string }).msg ?? "");
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
  } catch {
    /* not JSON — use raw body */
  }
  return trimmed;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const t = await res.text();
    const msg = messageFromErrorResponseBody(t) || res.statusText;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function getWorkbook() {
  return j<{ path: string; sheets: { name: string; rows: number }[] }>(
    await apiFetch(`${dataApiBase()}/api/workbook`, { cache: "no-store" }),
  );
}

export async function getColumns(sheet: string) {
  return j<{ columns: ColumnMeta[] }>(
    await apiFetch(
      `${dataApiBase()}/api/sheet/${encodeURIComponent(sheet)}/columns`,
      { cache: "no-store" },
    ),
  );
}

export type FacetResponse =
  | { kind: "datetime"; min: string | null; max: string | null }
  | { kind: "categorical" | "bool"; items: { value: string; count: number }[] };

export async function getFacet(
  sheet: string,
  column: string,
  opts?: { limit?: number; q?: string; sort?: "frequency" | "alpha" },
) {
  const p = new URLSearchParams();
  if (opts?.limit != null) p.set("limit", String(opts.limit));
  if (opts?.q) p.set("q", opts.q);
  if (opts?.sort) p.set("sort", opts.sort);
  const qs = p.toString();
  const url = `${dataApiBase()}/api/sheet/${encodeURIComponent(sheet)}/facet/${encodeURIComponent(column)}${qs ? `?${qs}` : ""}`;
  return j<FacetResponse>(await apiFetch(url, { cache: "no-store" }));
}

/** Distinct values for one column merged across every sheet (Category / Subcategory, etc.). */
export async function getWorkbookFacet(
  column: string,
  opts?: { limit?: number; q?: string; sort?: "frequency" | "alpha" },
) {
  const p = new URLSearchParams();
  if (opts?.limit != null) p.set("limit", String(opts.limit));
  if (opts?.q) p.set("q", opts.q);
  if (opts?.sort) p.set("sort", opts.sort);
  const qs = p.toString();
  const url = `${dataApiBase()}/api/workbook/facet/${encodeURIComponent(column)}${qs ? `?${qs}` : ""}`;
  return j<FacetResponse>(await apiFetch(url, { cache: "no-store" }));
}

/** Derived from Income/Expense column in budget data; `mixed` = both income- and expense-type rows. */
export type CategoryCatalogKind = "expense" | "income" | "mixed";

export type CategoryCatalogEntry = {
  id: number;
  name: string;
  /** Omitted on older servers; treat as `expense`. */
  kind?: CategoryCatalogKind;
  /** When true, omitted from transaction category pickers (still listed on Categories page). */
  is_hidden?: boolean;
  /** When true, rows with this category are excluded from dashboard/calendar/stats data previews. */
  hide_from_data_preview?: boolean;
  subcategories: { id: number; name: string }[];
};

export async function getCategoryCatalog() {
  return j<{ categories: CategoryCatalogEntry[] }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog`, { cache: "no-store" }),
  );
}

/** Copy distinct category/subcategory strings from transaction rows into the catalog. */
export async function seedCategoryCatalogFromBudget() {
  return j<{ categories_inserted: number; subcategories_inserted: number }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog/seed-from-budget`, {
      method: "POST",
    }),
  );
}

export async function createCategoryCatalog(
  name: string,
  kind: "expense" | "income" = "expense",
) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    }),
  );
}

export async function updateCategoryCatalog(
  id: number,
  body: {
    name?: string;
    is_hidden?: boolean;
    hide_from_data_preview?: boolean;
    kind?: CategoryCatalogKind;
  },
) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteCategoryCatalog(id: number) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog/${id}`, { method: "DELETE" }),
  );
}

export async function createSubcategoryCatalog(categoryId: number, name: string) {
  return j<{ id: number; category_id: number }>(
    await apiFetch(`${dataApiBase()}/api/category-catalog/${categoryId}/subcategories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function updateSubcategoryCatalog(id: number, name: string) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/subcategory-catalog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function deleteSubcategoryCatalog(id: number) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/subcategory-catalog/${id}`, { method: "DELETE" }),
  );
}

export async function analyze(body: AnalyzeBody) {
  return j<AnalyzeResponse>(
    await apiFetch(`${dataApiBase()}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export type TransactionKind = "expense" | "income" | "transfer";

export type TransactionPayload = {
  kind?: TransactionKind;
  transfer_to_account?: string | null;
  /** When kind is transfer: optional fee recorded as Expense on the from account. */
  transfer_fee?: number | null;
  period?: string | null;
  accounts?: string | null;
  category?: string | null;
  subcategory?: string | null;
  note?: string | null;
  php?: number | null;
  income_expense?: string | null;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
};

export async function createTransaction(body: TransactionPayload) {
  return j<{
    id: number;
    transfer_pair_id?: number;
    kind?: string;
    fee_id?: number;
  }>(
    await apiFetch(`${dataApiBase()}/api/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateTransaction(id: number, body: TransactionPayload) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/transaction/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteTransaction(id: number) {
  const tid = Math.trunc(Number(id));
  if (!Number.isFinite(tid) || tid < 1) {
    throw new Error("Invalid transaction id");
  }
  const res = await apiFetch(`${dataApiBase()}/api/transaction/${tid}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(messageFromErrorResponseBody(t) || res.statusText);
  }
  const text = await res.text();
  if (!text.trim()) {
    return { ok: true as const };
  }
  try {
    return JSON.parse(text) as { ok: boolean };
  } catch {
    return { ok: true as const };
  }
}

/** For calendar GET endpoints: optional JSON filter array (e.g. value visibility `nin`). */
export function appendExtraFilters(
  p: URLSearchParams,
  filters: AnalyzeBody["filters"] | undefined,
) {
  if (filters?.length) {
    p.set("extra_filters", JSON.stringify(filters));
  }
}

/** Calendar GETs: server maps Period → calendar day using the browser’s local zone (fixes midnight vs UTC). */
export function appendClientTimezoneOffset(p: URLSearchParams) {
  if (typeof window !== "undefined") {
    p.set("tz_offset_minutes", String(new Date().getTimezoneOffset()));
  }
}

/** Optional: convert calendar / balance totals to main currency using sub_rates. */
export function appendCurrencyConversion(
  p: URLSearchParams,
  conv: CurrencyConversionPayload | undefined,
) {
  if (!conv?.main_code?.trim()) return;
  p.set("currency_main", conv.main_code.trim());
  if (conv.sub_rates && Object.keys(conv.sub_rates).length > 0) {
    p.set("currency_rates", JSON.stringify(conv.sub_rates));
  }
}

export type AccountBalanceRow = { name: string; balance: number };

export type AccountBalancesResponse = {
  sheet: string;
  accounts: AccountBalanceRow[];
  accounts_column: string | null;
  amount_column: string | null;
  income_expense_column: string | null;
};

export async function getAccountBalances(
  sheet?: string,
  currencyConversion?: CurrencyConversionPayload,
) {
  const p = new URLSearchParams();
  if (sheet) p.set("sheet_name", sheet);
  appendCurrencyConversion(p, currencyConversion);
  const qs = p.toString();
  return j<AccountBalancesResponse>(
    await apiFetch(
      `${dataApiBase()}/api/accounts/balances${qs ? `?${qs}` : ""}`,
      { cache: "no-store" },
    ),
  );
}

export type PayslipRow = {
  id: number;
  total: number | null;
  commission: number | null;
  reimbursement: number | null;
  medical_reimbursement: number | null;
  others: number | null;
  mp2: number | null;
  allowances: number | null;
  /** Calendar year for this pay (e.g. 2024). */
  period_year: number | null;
  /** 1–12. */
  period_month: number | null;
  /** 1 = first half of month, 2 = second half. */
  period_half: number | null;
  notes: string | null;
  created_at: string;
};

export type PayslipCreateBody = {
  total?: number | null;
  commission?: number | null;
  reimbursement?: number | null;
  medical_reimbursement?: number | null;
  others?: number | null;
  mp2?: number | null;
  allowances?: number | null;
  period_year?: number | null;
  period_month?: number | null;
  period_half?: number | null;
  notes?: string | null;
};

export async function getPayslips(limit?: number) {
  const p = new URLSearchParams();
  if (limit != null) p.set("limit", String(limit));
  const qs = p.toString();
  return j<{ payslips: PayslipRow[] }>(
    await apiFetch(`${dataApiBase()}/api/payslip${qs ? `?${qs}` : ""}`, { cache: "no-store" }),
  );
}

export async function createPayslip(body: PayslipCreateBody) {
  return j<{ id: number; salary_transaction_id?: number }>(
    await apiFetch(`${dataApiBase()}/api/payslip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function getPayslip(id: number) {
  return j<PayslipRow>(
    await apiFetch(`${dataApiBase()}/api/payslip/${id}`, { cache: "no-store" }),
  );
}

/** Replace all fields (same shape as create). */
export async function updatePayslip(id: number, body: PayslipCreateBody) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/payslip/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deletePayslip(id: number) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/payslip/${id}`, { method: "DELETE" }),
  );
}

export async function uploadPayslipExcel(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return j<{ filename: string; inserted: number; ids: number[] }>(
    await apiFetch(`${dataApiBase()}/api/payslip/upload`, { method: "POST", body: fd }),
  );
}

/** Nested shape: { "2024": { "Total": { "January": [a, b], ... }, ... }, ... } */
export async function importPayslipJson(data: Record<string, unknown>) {
  return j<{ filename: string; inserted: number; ids: number[] }>(
    await apiFetch(`${dataApiBase()}/api/payslip/import-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
}

export type InstallmentRow = {
  id: number;
  name: string;
  /** Next installment number to pay (1…n). */
  installment_current: number;
  installment_total: number;
  principal: number;
  interest: number | null;
  payment_total: number;
  start_date: string;
  finish_date: string;
  remaining: number;
  original_total: number;
  created_at: string;
  /** Payment due for the current period (from schedule line when present). */
  due_payment?: number;
};

export type InstallmentLineRow = {
  seq: number;
  principal: number;
  interest: number | null;
  payment_total: number;
};

export type InstallmentDetailResponse = {
  installment: InstallmentRow;
  lines: InstallmentLineRow[];
};

export type InstallmentSummary = {
  sum_original_total: number;
  sum_remaining: number;
  due_this_month: number;
};

export type InstallmentCreateBody = {
  name: string;
  installment_current: number;
  installment_total: number;
  principal: number;
  interest?: number | null;
  payment_total: number;
  start_date: string;
  finish_date: string;
  remaining?: number | null;
  original_total?: number | null;
};

export async function getInstallments(limit?: number) {
  const p = new URLSearchParams();
  if (limit != null) p.set("limit", String(limit));
  const qs = p.toString();
  return j<{ installments: InstallmentRow[]; summary: InstallmentSummary }>(
    await apiFetch(`${dataApiBase()}/api/installment${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
    }),
  );
}

export async function getInstallment(id: number) {
  return j<InstallmentDetailResponse>(
    await apiFetch(`${dataApiBase()}/api/installment/${id}`, { cache: "no-store" }),
  );
}

export async function createInstallment(body: InstallmentCreateBody) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/installment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateInstallment(id: number, body: InstallmentCreateBody) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/installment/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteInstallment(id: number) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/installment/${id}`, { method: "DELETE" }),
  );
}

/** Record one payment: lowers remaining and advances installment #. */
export async function recordInstallmentPayment(id: number) {
  return j<{ installment: InstallmentRow }>(
    await apiFetch(`${dataApiBase()}/api/installment/${id}/pay`, { method: "POST" }),
  );
}

export async function updateInstallmentLine(
  installmentId: number,
  seq: number,
  body: { principal: number; interest: number | null },
) {
  return j<InstallmentDetailResponse>(
    await apiFetch(`${dataApiBase()}/api/installment/${installmentId}/line/${seq}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Stored repeat rules (subscriptions, rent); post-due creates real budget rows. */
export type RecurringRuleRow = {
  id: number;
  label: string;
  kind: "expense" | "income";
  frequency: "monthly" | "weekly" | "quarterly" | "yearly";
  day_of_month: number | null;
  weekday: number | null;
  month_of_year: number | null;
  accounts: string | null;
  category: string | null;
  subcategory: string | null;
  note: string | null;
  description: string | null;
  amount: number;
  currency: string | null;
  is_active: boolean;
  last_posted_period: string | null;
  created_at: string;
};

export async function getRecurringRules() {
  return j<{ rules: RecurringRuleRow[] }>(
    await apiFetch(`${dataApiBase()}/api/recurring-rules`, { cache: "no-store" }),
  );
}

export async function createRecurringRule(body: {
  label: string;
  kind: "expense" | "income";
  frequency: "monthly" | "weekly" | "quarterly" | "yearly";
  day_of_month?: number | null;
  weekday?: number | null;
  month_of_year?: number | null;
  accounts?: string | null;
  category?: string | null;
  subcategory?: string | null;
  /** Optional note on generated transactions. */
  note?: string | null;
  description?: string | null;
  amount: number;
  currency?: string | null;
  is_active?: boolean;
}) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/recurring-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateRecurringRule(
  id: number,
  body: Partial<{
    label: string;
    kind: "expense" | "income";
    frequency: "monthly" | "weekly" | "quarterly" | "yearly";
    day_of_month: number | null;
    weekday: number | null;
    month_of_year: number | null;
    accounts: string | null;
    category: string | null;
    subcategory: string | null;
    note: string | null;
    description: string | null;
    amount: number;
    currency: string | null;
    is_active: boolean;
    last_posted_period: string | null;
  }>,
) {
  return j<{ id: number }>(
    await apiFetch(`${dataApiBase()}/api/recurring-rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteRecurringRule(id: number) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/recurring-rules/${id}`, { method: "DELETE" }),
  );
}

export async function postDueRecurringRules() {
  return j<{
    posted: {
      rule_id: number;
      transaction_id: number;
      period_key: string;
    }[];
  }>(await apiFetch(`${dataApiBase()}/api/recurring-rules/post-due`, { method: "POST" }));
}

export async function uploadXlsx(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return j<{ path: string; filename: string }>(
    await apiFetch(`${dataApiBase()}/api/upload`, { method: "POST", body: fd }),
  );
}

export type CalendarDaySummary = {
  date: string;
  income: number;
  expense: number;
  /** Transfer-In amounts (separate from income). */
  transfer_in: number;
  /** Transfer-Out amounts (separate from expenses). */
  transfer_out: number;
  net: number;
};

/** Sums for the selected calendar month (all rows with Period in that month). */
export type CalendarMonthTotals = {
  total_income: number;
  total_expense: number;
  total_transfer_in: number;
  total_transfer_out: number;
  net_income_minus_expense: number;
};

/** Same shape as month totals; sums for the full calendar year. */
export type CalendarYearTotals = CalendarMonthTotals;

export type CalendarMonthResponse = {
  sheet: string;
  year: number;
  month: number;
  period_column: string;
  amount_column: string;
  income_expense_column: string | null;
  month_totals: CalendarMonthTotals;
  days: CalendarDaySummary[];
};

/** Min/max calendar dates from Period (same bucketing as other calendar routes). */
export type CalendarBoundsResponse = {
  sheet: string;
  period_column: string;
  first_date: string | null;
  last_date: string | null;
};

export async function getCalendarBounds(
  sheet?: string,
  extraFilters?: AnalyzeBody["filters"],
  currencyConversion?: CurrencyConversionPayload,
) {
  const p = new URLSearchParams();
  if (sheet) p.set("sheet_name", sheet);
  appendExtraFilters(p, extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, currencyConversion);
  const qs = p.toString();
  return j<CalendarBoundsResponse>(
    await apiFetch(
      `${dataApiBase()}/api/calendar/bounds${qs ? `?${qs}` : ""}`,
      { cache: "no-store" },
    ),
  );
}

export async function getCalendarMonth(
  year: number,
  month: number,
  sheet?: string,
  extraFilters?: AnalyzeBody["filters"],
  currencyConversion?: CurrencyConversionPayload,
) {
  const p = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (sheet) p.set("sheet_name", sheet);
  appendExtraFilters(p, extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, currencyConversion);
  return j<CalendarMonthResponse>(
    await apiFetch(`${dataApiBase()}/api/calendar/month?${p}`, { cache: "no-store" }),
  );
}

export type CalendarYearResponse = {
  sheet: string;
  year: number;
  period_column: string;
  amount_column: string;
  income_expense_column: string | null;
  year_totals: CalendarYearTotals;
};

export async function getCalendarYear(
  year: number,
  sheet?: string,
  extraFilters?: AnalyzeBody["filters"],
  currencyConversion?: CurrencyConversionPayload,
) {
  const p = new URLSearchParams({ year: String(year) });
  if (sheet) p.set("sheet_name", sheet);
  appendExtraFilters(p, extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, currencyConversion);
  return j<CalendarYearResponse>(
    await apiFetch(`${dataApiBase()}/api/calendar/year?${p}`, { cache: "no-store" }),
  );
}

/** Expense / income totals by category (same classification as calendar). */
export type CalendarCategoryBreakdownSlice = {
  name: string;
  value: number;
};

export type CalendarCategoryBreakdownResponse = {
  sheet: string;
  scope: "month" | "year";
  year: number;
  month: number | null;
  period_column: string;
  amount_column: string;
  category_column: string | null;
  slices: CalendarCategoryBreakdownSlice[];
  total_expense: number;
  income_slices: CalendarCategoryBreakdownSlice[];
  total_income: number;
};

export async function getCalendarCategoryBreakdown(
  year: number,
  opts?: {
    month?: number;
    sheet?: string;
    extraFilters?: AnalyzeBody["filters"];
    currencyConversion?: CurrencyConversionPayload;
  },
) {
  const p = new URLSearchParams({ year: String(year) });
  if (opts?.month != null) p.set("month", String(opts.month));
  if (opts?.sheet) p.set("sheet_name", opts.sheet);
  appendExtraFilters(p, opts?.extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, opts?.currencyConversion);
  return j<CalendarCategoryBreakdownResponse>(
    await apiFetch(`${dataApiBase()}/api/calendar/category-breakdown?${p}`, {
      cache: "no-store",
    }),
  );
}

export type CalendarMonthTransactionsResponse = {
  sheet: string;
  year: number;
  month: number;
  period_column: string;
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  sort_column: string;
  sort_direction: "asc" | "desc";
};

export async function getCalendarMonthTransactions(
  year: number,
  month: number,
  opts?: {
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
    /** If set, only rows with this Category (use (Uncategorized) for blank). */
    category?: string;
    /** If set (with category), only rows with this Subcategory (use (Uncategorized) for blank). */
    subcategory?: string;
    /** Limit rows to income or expense ledger (excludes transfers). */
    flowFilter?: "income" | "expense";
    sheet?: string;
    extraFilters?: AnalyzeBody["filters"];
    /** Case-insensitive substring across all columns (same as dashboard / analyze). */
    searchAll?: string;
    currencyConversion?: CurrencyConversionPayload;
  },
) {
  const p = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (opts?.sortColumn) p.set("sort_column", opts.sortColumn);
  if (opts?.sortDirection) p.set("sort_direction", opts.sortDirection);
  if (opts?.flowFilter === "income") p.set("flow_filter", "income");
  if (opts?.flowFilter === "expense") p.set("flow_filter", "expense");
  if (opts?.category != null && opts.category !== "") {
    p.set("category", opts.category);
  }
  if (opts?.subcategory != null && opts.subcategory !== "") {
    p.set("subcategory", opts.subcategory);
  }
  if (opts?.sheet) p.set("sheet_name", opts.sheet);
  const q = opts?.searchAll?.trim();
  if (q) p.set("search_all", q);
  appendExtraFilters(p, opts?.extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, opts?.currencyConversion);
  return j<CalendarMonthTransactionsResponse>(
    await apiFetch(
      `${dataApiBase()}/api/calendar/month/transactions?${p}`,
      { cache: "no-store" },
    ),
  );
}

export type CalendarYearTransactionsResponse = {
  sheet: string;
  year: number;
  period_column: string;
  count: number;
  columns: string[];
  rows: Record<string, unknown>[];
  sort_column: string;
  sort_direction: "asc" | "desc";
};

export async function getCalendarYearTransactions(
  year: number,
  opts?: {
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
    /** If set, only rows with this Category (use (Uncategorized) for blank). */
    category?: string;
    subcategory?: string;
    flowFilter?: "income" | "expense";
    sheet?: string;
    extraFilters?: AnalyzeBody["filters"];
    /** Case-insensitive substring across all columns (same as month transactions). */
    searchAll?: string;
    currencyConversion?: CurrencyConversionPayload;
  },
) {
  const p = new URLSearchParams({ year: String(year) });
  if (opts?.sortColumn) p.set("sort_column", opts.sortColumn);
  if (opts?.sortDirection) p.set("sort_direction", opts.sortDirection);
  if (opts?.flowFilter === "income") p.set("flow_filter", "income");
  if (opts?.flowFilter === "expense") p.set("flow_filter", "expense");
  if (opts?.category != null && opts.category !== "") {
    p.set("category", opts.category);
  }
  if (opts?.subcategory != null && opts.subcategory !== "") {
    p.set("subcategory", opts.subcategory);
  }
  if (opts?.sheet) p.set("sheet_name", opts.sheet);
  const q = opts?.searchAll?.trim();
  if (q) p.set("search_all", q);
  appendExtraFilters(p, opts?.extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, opts?.currencyConversion);
  return j<CalendarYearTransactionsResponse>(
    await apiFetch(`${dataApiBase()}/api/calendar/year/transactions?${p}`, {
      cache: "no-store",
    }),
  );
}

export type CalendarDayResponse = {
  sheet: string;
  date: string;
  /** Name of the date/time column (same as other calendar endpoints). */
  period_column: string;
  columns: string[];
  /** All transactions for this day, by Period (newest first). */
  rows: Record<string, unknown>[];
  total_income: number;
  total_expense: number;
  total_transfer_in: number;
  total_transfer_out: number;
  net: number;
};

export async function getCalendarDay(
  date: string,
  sheet?: string,
  extraFilters?: AnalyzeBody["filters"],
  currencyConversion?: CurrencyConversionPayload,
) {
  const p = new URLSearchParams({ date });
  if (sheet) p.set("sheet_name", sheet);
  appendExtraFilters(p, extraFilters);
  appendClientTimezoneOffset(p);
  appendCurrencyConversion(p, currencyConversion);
  return j<CalendarDayResponse>(
    await apiFetch(`${dataApiBase()}/api/calendar/day?${p}`, { cache: "no-store" }),
  );
}

/** Dashboard/settings UI prefs stored in PostgreSQL (`user_ui_preferences`). */
export async function getUserPreferences() {
  return j<{ data: Record<string, unknown> }>(
    await apiFetch(`${dataApiBase()}/api/user-preferences`, { cache: "no-store" }),
  );
}

export async function saveUserPreferences(payload: Record<string, unknown>) {
  return j<{ ok: boolean }>(
    await apiFetch(`${dataApiBase()}/api/user-preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function getBudgetLabels() {
  return j<{ accounts: string[]; currencies: string[] }>(
    await apiFetch(`${dataApiBase()}/api/budget-labels`, { cache: "no-store" }),
  );
}

export async function renameBudgetAccountLabel(oldLabel: string, newLabel: string) {
  return j<{
    ok: boolean;
    transactions_updated: number;
    recurring_rules_updated: number;
  }>(
    await apiFetch(`${dataApiBase()}/api/budget-labels/rename-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_label: oldLabel, new_label: newLabel }),
    }),
  );
}

export async function removeBudgetAccountLabel(label: string) {
  return j<{
    ok: boolean;
    transactions_updated: number;
    recurring_rules_updated: number;
  }>(
    await apiFetch(`${dataApiBase()}/api/budget-labels/remove-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }),
  );
}

export async function removeBudgetCurrencyLabel(label: string) {
  return j<{
    ok: boolean;
    transactions_updated: number;
    recurring_rules_updated: number;
  }>(
    await apiFetch(`${dataApiBase()}/api/budget-labels/remove-currency`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }),
  );
}

export { dataApiBase as apiBase };
