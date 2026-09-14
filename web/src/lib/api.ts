import { AUTH_UNAUTHORIZED_EVENT, clearSessionToken, getSessionToken } from "@/lib/auth";

/** API origin (FastAPI); override with `NEXT_PUBLIC_API_URL` for hosted UIs. */
export function dataApiBase(): string {
  const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  return rawApi && rawApi.length > 0
    ? rawApi.replace(/\/$/, "")
    : "http://127.0.0.1:8000";
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    clearSessionToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
  }
  return res;
}

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
    /* not JSON */
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

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function getJson<T>(path: string, query?: Record<string, string | number | undefined>) {
  return j<T>(
    await apiFetch(`${dataApiBase()}${path}${query ? qs(query) : ""}`, {
      cache: "no-store",
    }),
  );
}

async function sendJson<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = JSON_HEADERS;
    init.body = JSON.stringify(body);
  }
  return j<T>(await apiFetch(`${dataApiBase()}${path}`, init));
}

export type PayslipRow = {
  id: number;
  company: string;
  total: number | null;
  commission: number | null;
  reimbursement: number | null;
  medical_reimbursement: number | null;
  others: number | null;
  mp2: number | null;
  allowances: number | null;
  thirteenth_month: number | null;
  basic_salary: number | null;
  period_year: number | null;
  period_month: number | null;
  period_half: number | null;
  notes: string | null;
  withholding_tax: number | null;
  sss_contribution: number | null;
  philhealth: number | null;
  pag_ibig: number | null;
  trust_fund: number | null;
  has_pdf?: boolean;
  created_at: string;
};

export type PayslipCreateBody = {
  company: string;
  total?: number | null;
  commission?: number | null;
  reimbursement?: number | null;
  medical_reimbursement?: number | null;
  others?: number | null;
  mp2?: number | null;
  allowances?: number | null;
  thirteenth_month?: number | null;
  basic_salary?: number | null;
  period_year?: number | null;
  period_month?: number | null;
  period_half?: number | null;
  notes?: string | null;
  withholding_tax?: number | null;
  sss_contribution?: number | null;
  philhealth?: number | null;
  pag_ibig?: number | null;
  trust_fund?: number | null;
};

export async function getPayslips(limit?: number, company?: string) {
  return getJson<{ payslips: PayslipRow[] }>("/api/payslip", { limit, company });
}

export async function createPayslip(body: PayslipCreateBody) {
  return sendJson<PayslipRow>("POST", "/api/payslip", body);
}


export async function updatePayslip(id: number, body: PayslipCreateBody) {
  return sendJson<PayslipRow>("PUT", `/api/payslip/${id}`, body);
}

export async function deletePayslip(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/payslip/${id}`);
}


/** URL that serves the payslip's attached PDF inline (for `<iframe>`/links). */
export function payslipPdfUrl(id: number): string {
  return `${dataApiBase()}/api/payslip/${id}/pdf`;
}

export async function uploadPayslipPdf(id: number, file: File) {
  const body = new FormData();
  body.append("file", file);
  // No JSON headers — the browser sets the multipart boundary itself.
  return j<{ ok: boolean; has_pdf: boolean }>(
    await apiFetch(`${dataApiBase()}/api/payslip/${id}/pdf`, {
      method: "POST",
      body,
    }),
  );
}

export async function deletePayslipPdf(id: number) {
  return sendJson<{ ok: boolean; has_pdf: boolean }>(
    "DELETE",
    `/api/payslip/${id}/pdf`,
  );
}

export type InstallmentRow = {
  id: number;
  name: string;
  installment_current: number;
  installment_total: number;
  principal: number;
  interest: number | null;
  payment_total: number;
  start_date: string;
  finish_date: string;
  remaining: number;
  original_total: number;
  credit_card_id: number | null;
  created_at: string;
  due_payment?: number;
};

export type InstallmentLineRow = {
  id: number;
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
  credit_card_id?: number | null;
};

export async function getInstallments(limit?: number) {
  return getJson<{ installments: InstallmentRow[]; summary: InstallmentSummary }>(
    "/api/installment",
    { limit },
  );
}

export async function getInstallment(id: number) {
  return getJson<InstallmentDetailResponse>(`/api/installment/${id}`);
}

export async function getInstallmentSchedules(limit?: number) {
  return getJson<{ schedules: InstallmentDetailResponse[] }>(
    "/api/installment-schedules",
    { limit },
  );
}

export async function createInstallment(body: InstallmentCreateBody) {
  return sendJson<InstallmentDetailResponse>("POST", "/api/installment", body);
}

export async function updateInstallment(id: number, body: InstallmentCreateBody) {
  return sendJson<InstallmentDetailResponse>("PUT", `/api/installment/${id}`, body);
}

export async function deleteInstallment(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/installment/${id}`);
}

export async function recordInstallmentPayment(id: number) {
  return sendJson<{ installment: InstallmentRow }>(
    "POST",
    `/api/installment/${id}/pay`,
  );
}

export async function updateInstallmentLinesBulk(
  installmentId: number,
  lines: { seq: number; principal: number; interest: number | null }[],
) {
  return sendJson<InstallmentDetailResponse>(
    "PUT",
    `/api/installment/${installmentId}/lines`,
    { lines },
  );
}

export async function reorderInstallmentLines(installmentId: number, lineIds: number[]) {
  return sendJson<InstallmentDetailResponse>(
    "PUT",
    `/api/installment/${installmentId}/lines/reorder`,
    { line_ids: lineIds },
  );
}

export type HousePaymentRow = {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  entry_count: number;
  total_paid: number;
  last_paid_on: string | null;
};

export type HousePaymentEntry = {
  id: number;
  paid_on: string;
  amount: number;
  created_at: string;
};

export type HousePaymentDetailResponse = {
  house_payment: HousePaymentRow;
  entries: HousePaymentEntry[];
};

export type HousePaymentSummary = {
  sum_total_paid: number;
  total_entries: number;
  plan_count: number;
};

export type HousePaymentCreateBody = {
  name: string;
  notes?: string | null;
};

export type HousePaymentEntryBody = {
  paid_on: string;
  amount: number;
};

export async function getHousePayments(limit?: number) {
  return getJson<{ house_payments: HousePaymentRow[]; summary: HousePaymentSummary }>(
    "/api/house-payment",
    { limit },
  );
}

export async function getHousePayment(id: number) {
  return getJson<HousePaymentDetailResponse>(`/api/house-payment/${id}`);
}

export async function createHousePayment(body: HousePaymentCreateBody) {
  return sendJson<HousePaymentRow>("POST", "/api/house-payment", body);
}

export async function updateHousePayment(id: number, body: HousePaymentCreateBody) {
  return sendJson<HousePaymentRow>("PUT", `/api/house-payment/${id}`, body);
}

export async function deleteHousePayment(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/house-payment/${id}`);
}

export async function createHousePaymentEntry(
  housePaymentId: number,
  body: HousePaymentEntryBody,
) {
  return sendJson<HousePaymentDetailResponse>(
    "POST",
    `/api/house-payment/${housePaymentId}/entry`,
    body,
  );
}

export async function updateHousePaymentEntry(
  housePaymentId: number,
  entryId: number,
  body: HousePaymentEntryBody,
) {
  return sendJson<HousePaymentDetailResponse>(
    "PUT",
    `/api/house-payment/${housePaymentId}/entry/${entryId}`,
    body,
  );
}

export async function deleteHousePaymentEntry(
  housePaymentId: number,
  entryId: number,
) {
  return sendJson<HousePaymentDetailResponse>(
    "DELETE",
    `/api/house-payment/${housePaymentId}/entry/${entryId}`,
  );
}

export type MosaicCell = { r: number; c: number };

export type MosaicSolveResult = {
  moves: number[];
  optimal: boolean;
  nodeCount: number;
  /** False only if the time budget cut the search short before a conclusive
   * answer — i.e. inconclusive, not proven. */
  proven: boolean;
};

export async function solveMosaic(
  grid: number[][],
  seed: MosaicCell,
  timeBudgetMs?: number,
  /** When set, the backend gives up as soon as it's proven no solution of
   * this length or shorter exists, instead of searching for the true
   * (possibly much larger) optimum. */
  maxMoves?: number,
): Promise<MosaicSolveResult> {
  const res = await sendJson<{
    moves: number[];
    optimal: boolean;
    node_count: number;
    proven: boolean;
  }>("POST", "/api/mosaic/solve", {
    grid,
    seed,
    time_budget_ms: timeBudgetMs,
    max_moves: maxMoves,
  });
  return {
    moves: res.moves,
    optimal: res.optimal,
    nodeCount: res.node_count,
    proven: res.proven,
  };
}

/** A move under the "tap any tile" rule: repaint the blob at (r, c). */
export type MosaicFreeMove = { r: number; c: number; color: number };

export type MosaicFreeSolveResult = {
  moves: MosaicFreeMove[];
  optimal: boolean;
  nodeCount: number;
  proven: boolean;
};

/** Optimal solve where each move may repaint any blob, not just the blob
 * containing a fixed start tile. */
export async function solveMosaicFree(
  grid: number[][],
  numColors?: number,
  timeBudgetMs?: number,
  maxMoves?: number,
): Promise<MosaicFreeSolveResult> {
  const res = await sendJson<{
    moves: MosaicFreeMove[];
    optimal: boolean;
    node_count: number;
    proven: boolean;
  }>("POST", "/api/mosaic/solve-free", {
    grid,
    num_colors: numColors,
    time_budget_ms: timeBudgetMs,
    max_moves: maxMoves,
  });
  return {
    moves: res.moves,
    optimal: res.optimal,
    nodeCount: res.node_count,
    proven: res.proven,
  };
}

export type MosaicBestStartResult = {
  seed: MosaicCell;
  moves: number[];
  optimal: boolean;
  regionsTried: number;
  totalRegions: number;
};

export async function solveMosaicBestStart(
  grid: number[][],
  timeBudgetMs?: number,
): Promise<MosaicBestStartResult> {
  const res = await sendJson<{
    seed: MosaicCell;
    moves: number[];
    optimal: boolean;
    regions_tried: number;
    total_regions: number;
  }>("POST", "/api/mosaic/solve-best-start", { grid, time_budget_ms: timeBudgetMs });
  return {
    seed: res.seed,
    moves: res.moves,
    optimal: res.optimal,
    regionsTried: res.regions_tried,
    totalRegions: res.total_regions,
  };
}

export type MosaicGenerateResult = {
  grid: number[][];
  seed: MosaicCell;
  moves: number[];
  optimal: boolean;
  attempts: number;
  exactMatch: boolean;
};

export async function generateMosaicPuzzle(
  rows: number,
  cols: number,
  numColors: number,
  targetMoves: number,
  timeBudgetMs?: number,
): Promise<MosaicGenerateResult> {
  const res = await sendJson<{
    grid: number[][];
    seed: MosaicCell;
    moves: number[];
    optimal: boolean;
    attempts: number;
    exact_match: boolean;
  }>("POST", "/api/mosaic/generate", {
    rows,
    cols,
    num_colors: numColors,
    target_moves: targetMoves,
    time_budget_ms: timeBudgetMs,
  });
  return {
    grid: res.grid,
    seed: res.seed,
    moves: res.moves,
    optimal: res.optimal,
    attempts: res.attempts,
    exactMatch: res.exact_match,
  };
}

/**
 * Mambo (Takuzu / Binairo). `hSigns` is rows x (cols - 1) — the sign between
 * (r, c) and (r, c + 1); `vSigns` is (rows - 1) x cols, between (r, c) and
 * (r + 1, c). Sign values: 0 none, 1 "=", 2 "✕".
 */
export type MamboBoard = {
  grid: number[][];
  hSigns: number[][];
  vSigns: number[][];
};

function mamboBody(board: MamboBoard, timeBudgetMs?: number) {
  return {
    grid: board.grid,
    h_signs: board.hSigns,
    v_signs: board.vSigns,
    time_budget_ms: timeBudgetMs,
  };
}

export type MamboSolveResult = {
  solution: number[][] | null;
  /** Capped at 2, so 2 means "two or more". */
  solutionCount: number;
  unique: boolean;
  /** True only if the budget cut the search short, making the counts above
   * lower bounds rather than answers. */
  timedOut: boolean;
  nodeCount: number;
};

export async function solveMambo(
  board: MamboBoard,
  timeBudgetMs?: number,
): Promise<MamboSolveResult> {
  const res = await sendJson<{
    solution: number[][] | null;
    solution_count: number;
    unique: boolean;
    timed_out: boolean;
    node_count: number;
  }>("POST", "/api/mambo/solve", mamboBody(board, timeBudgetMs));
  return {
    solution: res.solution,
    solutionCount: res.solution_count,
    unique: res.unique,
    timedOut: res.timed_out,
    nodeCount: res.node_count,
  };
}

/** One cell the board forces, plus the technique and wording to explain it. */
export type MamboStep = {
  r: number;
  c: number;
  value: number;
  technique: string;
  detail: string;
};

export type MamboStepsResult = {
  steps: MamboStep[];
  solved: boolean;
  unique: boolean;
  solutionCount: number;
  /** The entries already on the board break a rule against each other. */
  conflict: boolean;
  timedOut: boolean;
};

export async function solveMamboSteps(
  board: MamboBoard,
  timeBudgetMs?: number,
): Promise<MamboStepsResult> {
  const res = await sendJson<{
    steps: MamboStep[];
    solved: boolean;
    unique: boolean;
    solution_count: number;
    conflict: boolean;
    timed_out: boolean;
  }>("POST", "/api/mambo/steps", mamboBody(board, timeBudgetMs));
  return {
    steps: res.steps,
    solved: res.solved,
    unique: res.unique,
    solutionCount: res.solution_count,
    conflict: res.conflict,
    timedOut: res.timed_out,
  };
}

export type MamboDifficulty = "easy" | "medium" | "hard";

export type MamboGenerateResult = {
  grid: number[][];
  solution: number[][];
  hSigns: number[][];
  vSigns: number[][];
  /** The difficulty actually achieved, which `exactMatch` compares to the one
   * that was asked for. */
  difficulty: MamboDifficulty;
  /** False when the clock ran out before the difficulty could be established,
   * in which case `difficulty` is the worst case rather than a measurement. */
  difficultyConfirmed: boolean;
  exactMatch: boolean;
  attempts: number;
  givenCount: number;
};

export async function generateMamboPuzzle(
  rows: number,
  cols: number,
  difficulty: MamboDifficulty,
  timeBudgetMs?: number,
): Promise<MamboGenerateResult> {
  const res = await sendJson<{
    grid: number[][];
    solution: number[][];
    h_signs: number[][];
    v_signs: number[][];
    difficulty: MamboDifficulty;
    difficulty_confirmed: boolean;
    exact_match: boolean;
    attempts: number;
    given_count: number;
  }>("POST", "/api/mambo/generate", {
    rows,
    cols,
    difficulty,
    time_budget_ms: timeBudgetMs,
  });
  return {
    grid: res.grid,
    solution: res.solution,
    hSigns: res.h_signs,
    vSigns: res.v_signs,
    difficulty: res.difficulty,
    difficultyConfirmed: res.difficulty_confirmed,
    exactMatch: res.exact_match,
    attempts: res.attempts,
    givenCount: res.given_count,
  };
}

export type BloodPressureRow = {
  id: number;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  spo2: number | null;
  temperature: number | null;
  weight: number | null;
  notes: string | null;
  created_at: string;
};

export type BloodPressureCreateBody = {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  spo2?: number | null;
  temperature?: number | null;
  weight?: number | null;
  notes?: string | null;
};

export async function getBloodPressures(limit?: number) {
  return getJson<{ readings: BloodPressureRow[] }>("/api/blood-pressure", {
    limit,
  });
}

export async function createBloodPressure(body: BloodPressureCreateBody) {
  return sendJson<{ reading: BloodPressureRow }>(
    "POST",
    "/api/blood-pressure",
    body,
  );
}

export async function updateBloodPressure(
  id: number,
  body: BloodPressureCreateBody,
) {
  return sendJson<{ reading: BloodPressureRow }>(
    "PUT",
    `/api/blood-pressure/${id}`,
    body,
  );
}

export async function deleteBloodPressure(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/blood-pressure/${id}`);
}

export type FixedExpenseRow = {
  id: number;
  period_half: number;
  period_year: number;
  period_month: number;
  amount: number;
  description: string | null;
  created_at: string;
};

export type FixedExpenseCreateBody = {
  period_half: 1 | 2;
  amount: number;
  description?: string | null;
  period_year: number;
  period_month: number;
};

export async function getFixedExpenses(
  periodHalf?: 1 | 2,
  periodYear?: number,
  periodMonth?: number,
) {
  return getJson<{ expenses: FixedExpenseRow[] }>("/api/fixed-expense", {
    period_half: periodHalf,
    period_year: periodYear,
    period_month: periodMonth,
  });
}

export async function createFixedExpense(body: FixedExpenseCreateBody) {
  return sendJson<{ expense: FixedExpenseRow }>("POST", "/api/fixed-expense", body);
}

export async function deleteFixedExpense(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/fixed-expense/${id}`);
}

export type MonthlyExpenseRow = {
  id: number;
  name: string;
  description: string | null;
  amount: number;
  period_half: number;
  period_year: number;
  period_month: number;
  is_recurring: boolean;
  created_at: string;
};

export type MonthlyExpenseCreateBody = {
  name: string;
  description?: string | null;
  amount: number;
  period_half: 1 | 2;
  period_year: number;
  period_month: number;
  is_recurring?: boolean;
};

export async function getMonthlyExpenses(
  periodHalf?: 1 | 2,
  periodYear?: number,
  periodMonth?: number,
) {
  return getJson<{ expenses: MonthlyExpenseRow[] }>("/api/monthly-expense", {
    period_half: periodHalf,
    period_year: periodYear,
    period_month: periodMonth,
  });
}

export async function createMonthlyExpense(body: MonthlyExpenseCreateBody) {
  return sendJson<{ expense: MonthlyExpenseRow }>("POST", "/api/monthly-expense", body);
}

export async function updateMonthlyExpense(id: number, body: MonthlyExpenseCreateBody) {
  return sendJson<{ expense: MonthlyExpenseRow }>("PUT", `/api/monthly-expense/${id}`, body);
}

export async function deleteMonthlyExpense(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/monthly-expense/${id}`);
}

export type CalendarDayOverrideRow = {
  id: number;
  day: string;
  amount: number;
  created_at: string;
};

export async function getCalendarDayOverrides() {
  return getJson<{ overrides: CalendarDayOverrideRow[] }>("/api/calendar-day-override");
}

export async function bulkUpsertCalendarDayOverrides(
  overrides: { day: string; amount: number }[],
) {
  return sendJson<{ overrides: CalendarDayOverrideRow[] }>(
    "PUT",
    "/api/calendar-day-override/bulk",
    { overrides },
  );
}

export type PayPeriodStartOverrideRow = {
  id: number;
  period_year: number;
  period_month: number;
  period_half: 1 | 2;
  start_date: string;
  created_at: string;
};

export async function getPayPeriodStartOverrides() {
  return getJson<{ overrides: PayPeriodStartOverrideRow[] }>("/api/pay-period-start-override");
}

export async function upsertPayPeriodStartOverride(body: {
  period_year: number;
  period_month: number;
  period_half: 1 | 2;
  start_date: string;
}) {
  return sendJson<{ override: PayPeriodStartOverrideRow }>(
    "PUT",
    "/api/pay-period-start-override",
    body,
  );
}

/** Wire shape for a Settings → Payslip defaults template (Payslip's `FormState` minus `period_half`). */
export type PayslipDefaultFormDto = {
  period_year: string;
  period_month: string;
  total: string;
  basic_salary: string;
  commission: string;
  reimbursement: string;
  medical_reimbursement: string;
  others: string;
  mp2: string;
  allowances: string;
  thirteenth_month: string;
  notes: string;
  withholding_tax: string;
  sss_contribution: string;
  philhealth: string;
  pag_ibig: string;
  trust_fund: string;
};

export type PayslipDefaultsBundleDto = {
  formFirst: Record<string, unknown>;
  formSecond: Record<string, unknown>;
  settingsHalf: string;
};

export async function getPayslipDefaults(company: string) {
  return getJson<PayslipDefaultsBundleDto>("/api/payslip-defaults", { company });
}

export async function savePayslipDefaults(body: {
  company: string;
  form_first: PayslipDefaultFormDto;
  form_second: PayslipDefaultFormDto;
  settings_half: "first" | "second";
}) {
  return sendJson<PayslipDefaultsBundleDto>("PUT", "/api/payslip-defaults", body);
}

export async function deletePayPeriodStartOverride(
  periodYear: number,
  periodMonth: number,
  periodHalf: 1 | 2,
) {
  return sendJson<{ ok: boolean }>(
    "DELETE",
    `/api/pay-period-start-override${qs({
      period_year: periodYear,
      period_month: periodMonth,
      period_half: periodHalf,
    })}`,
  );
}

export type CreditCardRow = {
  id: number;
  name: string;
  credit_limit: number;
  last_statement_balance: number;
  current_balance: number;
  available_limit: number;
  minimum_due: number;
  interest_rate: number;
  statement_date: string | null;
  due_date: string | null;
  monthly_dues: number;
  created_at: string;
};

export type CreditCardPaymentRow = {
  id: number;
  credit_card_id: number;
  amount: number;
  payment_date: string;
  note: string | null;
  created_at: string;
};

export type CreditCardCreateBody = {
  name: string;
  credit_limit: number;
  last_statement_balance: number;
  minimum_due: number;
  interest_rate: number;
  statement_date?: string | null;
  due_date?: string | null;
};

export type CreditCardPaymentCreateBody = {
  amount: number;
  payment_date: string;
  note?: string | null;
};

export type CreditCardResponse = {
  card: CreditCardRow | null;
  installments: InstallmentRow[];
  payments: CreditCardPaymentRow[];
};

export async function getCreditCard() {
  return getJson<CreditCardResponse>("/api/credit-card");
}

export async function createCreditCard(body: CreditCardCreateBody) {
  return sendJson<{ card: CreditCardRow }>("POST", "/api/credit-card", body);
}

export async function updateCreditCard(id: number, body: CreditCardCreateBody) {
  return sendJson<{ card: CreditCardRow }>("PUT", `/api/credit-card/${id}`, body);
}

export async function deleteCreditCard(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/credit-card/${id}`);
}

/** Directly correct available credit, e.g. for purchases this app never recorded. */
export async function adjustCreditCardBalance(id: number, availableLimit: number) {
  return sendJson<{ card: CreditCardRow }>("PATCH", `/api/credit-card/${id}/balance`, {
    available_limit: availableLimit,
  });
}

export async function createCreditCardPayment(
  cardId: number,
  body: CreditCardPaymentCreateBody,
) {
  return sendJson<{ payment: CreditCardPaymentRow; card: CreditCardRow }>(
    "POST",
    `/api/credit-card/${cardId}/payments`,
    body,
  );
}

export async function deleteCreditCardPayment(paymentId: number) {
  return sendJson<{ ok: boolean; card: CreditCardRow | null }>(
    "DELETE",
    `/api/credit-card/payments/${paymentId}`,
  );
}

export type LottoDrawRow = {
  id: number;
  draw_date: string;
  numbers: number[];
  jackpot_prize: number | null;
  winners: number;
  created_at: string;
};

export type LottoAttemptRow = {
  id: number;
  draw_id: number;
  /** Groups this attempt with the other board plays on the same physical
   * ticket, so the UI can cluster them. `null` means ungrouped. */
  ticket: number | null;
  numbers: number[];
  created_at: string;
  /** Hidden attempts aren't deleted — they're just tucked out of the normal
   * view until "Show hidden" is switched on. */
  hidden: boolean;
};

export type LottoDrawDetail = {
  draw: LottoDrawRow;
  attempts: LottoAttemptRow[];
};

export async function getLottoDraws(limit?: number) {
  return getJson<{ draws: LottoDrawDetail[] }>("/api/lotto", { limit });
}

/** `numbers: null` logs just the date — the result can be filled in later
 * once it's announced, so attempts can be recorded ahead of the draw.
 * `jackpotPrize`/`winners` default to "not set yet" (null / 0), same as the
 * backend does when they're omitted. */
export async function setLottoDraw(
  drawDate: string,
  numbers: number[] | null,
  jackpotPrize?: number | null,
  winners?: number,
) {
  return sendJson<LottoDrawDetail>("POST", "/api/lotto", {
    draw_date: drawDate,
    numbers,
    jackpot_prize: jackpotPrize ?? null,
    winners: winners ?? 0,
  });
}

export async function updateLottoDraw(
  drawId: number,
  drawDate: string,
  numbers: number[] | null,
  jackpotPrize?: number | null,
  winners?: number,
) {
  return sendJson<LottoDrawDetail>("PUT", `/api/lotto/${drawId}`, {
    draw_date: drawDate,
    numbers,
    jackpot_prize: jackpotPrize ?? null,
    winners: winners ?? 0,
  });
}

export async function deleteLottoDraw(drawId: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/lotto/${drawId}`);
}

export async function createLottoAttempt(
  drawId: number,
  numbers: number[],
  ticket?: number | null,
) {
  return sendJson<LottoDrawDetail>("POST", `/api/lotto/${drawId}/attempts`, {
    numbers,
    ticket: ticket ?? null,
  });
}

export async function updateLottoAttempt(
  drawId: number,
  attemptId: number,
  numbers: number[],
  ticket?: number | null,
) {
  return sendJson<LottoDrawDetail>(
    "PUT",
    `/api/lotto/${drawId}/attempts/${attemptId}`,
    { numbers, ticket: ticket ?? null },
  );
}

export async function deleteLottoAttempt(drawId: number, attemptId: number) {
  return sendJson<LottoDrawDetail>(
    "DELETE",
    `/api/lotto/${drawId}/attempts/${attemptId}`,
  );
}

/** Bulk-loads historic results from pasted text — one row per draw:
 * `| n1-n2-n3-n4-n5-n6 | m/d/yyyy | jackpot | winners |` (a leading
 * tab-separated game-name column, e.g. pasted straight from a spreadsheet,
 * is fine too — it's discarded). Each row is upserted by date, so re-pasting
 * (e.g. to backfill jackpot/winners on draws already here) overwrites
 * rather than duplicating. */
export async function importLottoDrawResultsText(text: string) {
  return sendJson<{
    inserted: number;
    updated: number;
    total: number;
    errors: string[];
  }>("POST", "/api/lotto/import-text", { text });
}

/** Hides or unhides an attempt without deleting it. */
export async function setLottoAttemptHidden(
  drawId: number,
  attemptId: number,
  hidden: boolean,
) {
  return sendJson<LottoDrawDetail>(
    "PUT",
    `/api/lotto/${drawId}/attempts/${attemptId}/hidden`,
    { hidden },
  );
}

/** An app-managed user account. Passwords are Argon2id-hashed server-side —
 * this type never carries one. These are the credentials checked at login
 * (see AuthGate) once at least one user exists; managed via Settings → Users. */
export type AppUserRow = {
  id: number;
  username: string;
  created_at: string;
};

export type AppUserCreateBody = {
  username: string;
  password: string;
};

export type AppUserUpdateBody = {
  username?: string;
  password?: string;
};

export async function getAppUsers() {
  return getJson<{ users: AppUserRow[] }>("/api/users");
}

export async function createAppUser(body: AppUserCreateBody) {
  return sendJson<{ user: AppUserRow }>("POST", "/api/users", body);
}

export async function updateAppUser(id: number, body: AppUserUpdateBody) {
  return sendJson<{ user: AppUserRow }>("PUT", `/api/users/${id}`, body);
}

export async function deleteAppUser(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/users/${id}`);
}

/** Checks a username/password pair against the stored hash. Doesn't sign
 * anyone in — just confirms a password was saved correctly. */
export async function verifyAppUserPassword(username: string, password: string) {
  return sendJson<{ valid: boolean }>("POST", "/api/users/verify", {
    username,
    password,
  });
}

/** The 14 per-company "show this field?" toggles — one per payslip amount
 * field, income-side first (the main grid in PayslipFormFields), then
 * deduction-side (the "Deductions" aside). */
export type CompanyColumnFlags = {
  show_total: boolean;
  show_basic_salary: boolean;
  /** Whether the Commission field/stat card show up on this company's Payslip page. */
  show_commission: boolean;
  show_reimbursement: boolean;
  show_medical_reimbursement: boolean;
  show_others: boolean;
  show_allowances: boolean;
  show_thirteenth_month: boolean;
  show_withholding_tax: boolean;
  show_sss_contribution: boolean;
  show_philhealth: boolean;
  show_pag_ibig: boolean;
  show_mp2: boolean;
  show_trust_fund: boolean;
};

/** A company payslips are tagged under; managed via Settings → Companies. */
export type CompanyRow = CompanyColumnFlags & {
  id: number;
  name: string;
  created_at: string;
  sort_order: number;
};

/** What every column defaulted to before this toggle existed (all shown),
 * except Trust Fund, which is new and defaults to hidden. Used whenever a
 * payslip's `company` string doesn't match any managed company (e.g. an
 * old/deleted one) so fields still show up rather than vanishing. */
export const DEFAULT_COMPANY_COLUMN_FLAGS: CompanyColumnFlags = {
  show_total: true,
  show_basic_salary: true,
  show_commission: true,
  show_reimbursement: true,
  show_medical_reimbursement: true,
  show_others: true,
  show_allowances: true,
  show_thirteenth_month: true,
  show_withholding_tax: true,
  show_sss_contribution: true,
  show_philhealth: true,
  show_pag_ibig: true,
  show_mp2: true,
  show_trust_fund: false,
};

/** Looks up `companyName` in `companies` and returns its column-visibility
 * flags, falling back to `DEFAULT_COMPANY_COLUMN_FLAGS` when not found. */
export function companyColumnFlags(
  companies: CompanyRow[],
  companyName: string,
): CompanyColumnFlags {
  const c = companies.find((c) => c.name === companyName);
  if (!c) return DEFAULT_COMPANY_COLUMN_FLAGS;
  return {
    show_total: c.show_total,
    show_basic_salary: c.show_basic_salary,
    show_commission: c.show_commission,
    show_reimbursement: c.show_reimbursement,
    show_medical_reimbursement: c.show_medical_reimbursement,
    show_others: c.show_others,
    show_allowances: c.show_allowances,
    show_thirteenth_month: c.show_thirteenth_month,
    show_withholding_tax: c.show_withholding_tax,
    show_sss_contribution: c.show_sss_contribution,
    show_philhealth: c.show_philhealth,
    show_pag_ibig: c.show_pag_ibig,
    show_mp2: c.show_mp2,
    show_trust_fund: c.show_trust_fund,
  };
}

export async function getCompanies() {
  return getJson<{ companies: CompanyRow[] }>("/api/companies");
}

export async function createCompany(name: string, flags: CompanyColumnFlags) {
  return sendJson<{ company: CompanyRow }>("POST", "/api/companies", {
    name,
    ...flags,
  });
}

export async function updateCompany(id: number, name: string, flags: CompanyColumnFlags) {
  return sendJson<{ company: CompanyRow }>("PUT", `/api/companies/${id}`, {
    name,
    ...flags,
  });
}

export async function deleteCompany(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/companies/${id}`);
}

/** Persists a new display order — `ids` must list every company id exactly
 * once, top to bottom. Drives both the Companies list and the sidebar's
 * per-company Payslip entries, since both just render `getCompanies()`'s
 * order as-is. */
export async function reorderCompanies(ids: number[]) {
  return sendJson<{ companies: CompanyRow[] }>("PUT", "/api/companies/reorder", { ids });
}

/** A trip is filed under an entry year + start/end month (like a journal
 * entry, but spanning several consecutive months for a longer trip —
 * `entry_month_end` equals `entry_month` for the default single-month case). */
export type TravelTripRow = {
  id: number;
  title: string;
  entry_year: number;
  entry_month: number;
  entry_month_end: number;
  notes: string | null;
  created_at: string;
};

export type TravelFlightRow = {
  id: number;
  trip_id: number;
  flight_number: string;
  flight_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  from_location: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `from_location`. */
  from_map_url: string | null;
  to_location: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `to_location`. */
  to_map_url: string | null;
  notes: string | null;
  created_at: string;
};

/** A bus or train leg — same shape as a flight, plus a `mode`; the number
 * is optional since a bus route isn't always known/labeled the way a
 * flight number is. */
export type TravelTransportRow = {
  id: number;
  trip_id: number;
  mode: "bus" | "train";
  number: string | null;
  travel_date: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  from_location: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `from_location`. */
  from_map_url: string | null;
  to_location: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `to_location`. */
  to_map_url: string | null;
  notes: string | null;
  created_at: string;
};

export type TravelItineraryRow = {
  id: number;
  trip_id: number;
  item_date: string;
  /** Set only when the item spans past its start date (an overnight train,
   * a multi-day trek) — `null` means a same-day item. */
  item_end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  activity: string;
  location_name: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `location_name`. */
  location_map_url: string | null;
  notes: string | null;
  created_at: string;
};

export type TravelAccommodationRow = {
  id: number;
  trip_id: number;
  name: string;
  checkin_date: string;
  checkout_date: string;
  checkin_time: string | null;
  checkout_time: string | null;
  /** Derived from checkin/checkout on every read — never stored. */
  nights: number;
  days: number;
  booking_confirmation: string | null;
  instructions: string | null;
  location_name: string | null;
  /** Custom Google Maps link; when unset the UI builds a search link from `location_name`. */
  location_map_url: string | null;
  notes: string | null;
  created_at: string;
};

export type TravelTripDetail = {
  trip: TravelTripRow;
  flights: TravelFlightRow[];
  transport: TravelTransportRow[];
  itinerary: TravelItineraryRow[];
  accommodations: TravelAccommodationRow[];
};

export type TravelTripCreateBody = {
  title: string;
  entry_year: number;
  entry_month: number;
  entry_month_end: number;
  notes?: string | null;
};

export type TravelFlightBody = {
  flight_number: string;
  flight_date?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  from_location?: string | null;
  from_map_url?: string | null;
  to_location?: string | null;
  to_map_url?: string | null;
  notes?: string | null;
};

export type TravelTransportBody = {
  mode: "bus" | "train";
  number?: string | null;
  travel_date?: string | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  from_location?: string | null;
  from_map_url?: string | null;
  to_location?: string | null;
  to_map_url?: string | null;
  notes?: string | null;
};

export type TravelItineraryBody = {
  item_date: string;
  item_end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  activity: string;
  location_name?: string | null;
  location_map_url?: string | null;
  notes?: string | null;
};

export type TravelAccommodationBody = {
  name: string;
  checkin_date: string;
  checkout_date: string;
  checkin_time?: string | null;
  checkout_time?: string | null;
  booking_confirmation?: string | null;
  instructions?: string | null;
  location_name?: string | null;
  location_map_url?: string | null;
  notes?: string | null;
};

export async function getTravelTrips(limit?: number) {
  return getJson<{ trips: TravelTripDetail[] }>("/api/travel", { limit });
}

export async function createTravelTrip(body: TravelTripCreateBody) {
  return sendJson<TravelTripDetail>("POST", "/api/travel", body);
}

export async function updateTravelTrip(tripId: number, body: TravelTripCreateBody) {
  return sendJson<TravelTripDetail>("PUT", `/api/travel/${tripId}`, body);
}

export async function deleteTravelTrip(tripId: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/travel/${tripId}`);
}

export async function createTravelFlight(tripId: number, body: TravelFlightBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/flights`, body);
}

export async function updateTravelFlight(
  tripId: number,
  flightId: number,
  body: TravelFlightBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/flights/${flightId}`,
    body,
  );
}

export async function deleteTravelFlight(tripId: number, flightId: number) {
  return sendJson<TravelTripDetail>("DELETE", `/api/travel/${tripId}/flights/${flightId}`);
}

export async function createTravelTransport(tripId: number, body: TravelTransportBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/transport`, body);
}

export async function updateTravelTransport(
  tripId: number,
  transportId: number,
  body: TravelTransportBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/transport/${transportId}`,
    body,
  );
}

export async function deleteTravelTransport(tripId: number, transportId: number) {
  return sendJson<TravelTripDetail>(
    "DELETE",
    `/api/travel/${tripId}/transport/${transportId}`,
  );
}

export async function createTravelItinerary(tripId: number, body: TravelItineraryBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/itinerary`, body);
}

export async function updateTravelItinerary(
  tripId: number,
  itemId: number,
  body: TravelItineraryBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/itinerary/${itemId}`,
    body,
  );
}

export async function deleteTravelItinerary(tripId: number, itemId: number) {
  return sendJson<TravelTripDetail>("DELETE", `/api/travel/${tripId}/itinerary/${itemId}`);
}

export async function createTravelAccommodation(
  tripId: number,
  body: TravelAccommodationBody,
) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/accommodations`, body);
}

export async function updateTravelAccommodation(
  tripId: number,
  accommodationId: number,
  body: TravelAccommodationBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/accommodations/${accommodationId}`,
    body,
  );
}

export async function deleteTravelAccommodation(tripId: number, accommodationId: number) {
  return sendJson<TravelTripDetail>(
    "DELETE",
    `/api/travel/${tripId}/accommodations/${accommodationId}`,
  );
}
