import type { components } from "@/lib/api-schema";
import { AUTH_UNAUTHORIZED_EVENT, clearSessionToken, getSessionToken } from "@/lib/auth";
import { getQueryClient } from "@/lib/queryClient";

// Shapes come from the API itself: npm run api:types regenerates api-schema.d.ts from openapi.json.
type S = components["schemas"];

export function dataApiBase(): string {
  const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  return rawApi && rawApi.length > 0 ? rawApi.replace(/\/$/, "") : "";
}

// What to show for something thrown: its own message when it is an Error.
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  const method = (init?.method ?? "GET").toUpperCase();
  if (res.ok && method !== "GET" && method !== "HEAD") {
    // A write can change what any page shows (the API links cards, bills and the budget), so refetch what's on
    // screen before the caller goes on: after `await saveSomething()` the page's data is already current.
    // ponytail: refetches every visible query, not just the touched ones; key by resource if traffic matters.
    await getQueryClient().invalidateQueries();
  }
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
            return String((item as { msg?: string }).msg ?? "").replace(/^Value error, /, "");
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
  } catch {
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

export type PayslipRow = S["PayslipRow"];

export type PayslipCreateBody = S["PayslipCreate"];

export async function getPayslips(limit?: number, company?: string) {
  return getJson<{ payslips: PayslipRow[] }>("/api/payslip", { limit, company });
}

export async function createPayslip(body: PayslipCreateBody) {
  return sendJson<PayslipRow>("POST", "/api/payslip", body);
}

export async function updatePayslip(id: string, body: PayslipCreateBody) {
  return sendJson<PayslipRow>("PUT", `/api/payslip/${id}`, body);
}

export async function deletePayslip(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/payslip/${id}`);
}

export function payslipPdfUrl(id: string): string {
  return `${dataApiBase()}/api/payslip/${id}/pdf`;
}

async function uploadPdf<T = { ok: boolean; has_pdf: boolean }>(path: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return j<T>(
    await apiFetch(`${dataApiBase()}${path}`, {
      method: "POST",
      body,
    }),
  );
}

export async function uploadPayslipPdf(id: string, file: File) {
  return uploadPdf(`/api/payslip/${id}/pdf`, file);
}

export type PayslipPdfFields = S["PayslipPdfFields"];

// Reads a Sophos payslip PDF (the layout used since August 2025) without saving anything.
export async function readPayslipPdf(file: File) {
  return uploadPdf<PayslipPdfFields>("/api/payslip/extract", file);
}

export async function deletePayslipPdf(id: string) {
  return sendJson<{ ok: boolean; has_pdf: boolean }>(
    "DELETE",
    `/api/payslip/${id}/pdf`,
  );
}

export type InstallmentRow = S["InstallmentRow"];

export type InstallmentLineRow = S["InstallmentLineRow"];

export type InstallmentDetailResponse = S["InstallmentDetail"];

export type InstallmentSummary = S["InstallmentSummary"];

export type InstallmentCreateBody = S["InstallmentCreate"];

export async function getInstallments(limit?: number) {
  return getJson<{ installments: InstallmentRow[]; summary: InstallmentSummary }>(
    "/api/installment",
    { limit },
  );
}

export async function getInstallment(id: string) {
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

export async function updateInstallment(id: string, body: InstallmentCreateBody) {
  return sendJson<InstallmentDetailResponse>("PUT", `/api/installment/${id}`, body);
}

export async function deleteInstallment(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/installment/${id}`);
}

export async function recordInstallmentPayment(id: string) {
  return sendJson<{ installment: InstallmentRow }>(
    "POST",
    `/api/installment/${id}/pay`,
  );
}

export async function updateInstallmentLinesBulk(
  installmentId: string,
  lines: { seq: number; principal: number; interest: number | null }[],
) {
  return sendJson<InstallmentDetailResponse>(
    "PUT",
    `/api/installment/${installmentId}/lines`,
    { lines },
  );
}

export async function reorderInstallmentLines(installmentId: string, lineIds: string[]) {
  return sendJson<InstallmentDetailResponse>(
    "PUT",
    `/api/installment/${installmentId}/lines/reorder`,
    { line_ids: lineIds },
  );
}

export type HousePaymentRow = S["HousePaymentRow"];

export type HousePaymentEntry = S["HousePaymentEntry"];

export type HousePaymentDetailResponse = S["HousePaymentDetail"];

export type HousePaymentSummary = S["HousePaymentSummary"];

export type HousePaymentCreateBody = S["HousePaymentCreate"];

export type HousePaymentEntryBody = S["HousePaymentEntryCreate"];

export async function getHousePayments(limit?: number) {
  return getJson<{ house_payments: HousePaymentRow[]; summary: HousePaymentSummary }>(
    "/api/house-payment",
    { limit },
  );
}

export async function getHousePayment(id: string) {
  return getJson<HousePaymentDetailResponse>(`/api/house-payment/${id}`);
}

export async function createHousePayment(body: HousePaymentCreateBody) {
  return sendJson<HousePaymentRow>("POST", "/api/house-payment", body);
}

export async function updateHousePayment(id: string, body: HousePaymentCreateBody) {
  return sendJson<HousePaymentRow>("PUT", `/api/house-payment/${id}`, body);
}

export async function deleteHousePayment(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/house-payment/${id}`);
}

export async function createHousePaymentEntry(
  housePaymentId: string,
  body: HousePaymentEntryBody,
) {
  return sendJson<HousePaymentDetailResponse>(
    "POST",
    `/api/house-payment/${housePaymentId}/entry`,
    body,
  );
}

export async function updateHousePaymentEntry(
  housePaymentId: string,
  entryId: string,
  body: HousePaymentEntryBody,
) {
  return sendJson<HousePaymentDetailResponse>(
    "PUT",
    `/api/house-payment/${housePaymentId}/entry/${entryId}`,
    body,
  );
}

export async function deleteHousePaymentEntry(
  housePaymentId: string,
  entryId: string,
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
  proven: boolean;
};

export async function solveMosaic(
  grid: number[][],
  seed: MosaicCell,
  timeBudgetMs?: number,
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

export type MosaicFreeMove = { r: number; c: number; color: number };

export type MosaicFreeSolveResult = {
  moves: MosaicFreeMove[];
  optimal: boolean;
  nodeCount: number;
  proven: boolean;
};

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
  solutionCount: number;
  unique: boolean;
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
  difficulty: MamboDifficulty;
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

export type BloodPressureRow = S["BloodPressureRow"];

export type BloodPressureCreateBody = S["BloodPressureCreate"];

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
  id: string,
  body: BloodPressureCreateBody,
) {
  return sendJson<{ reading: BloodPressureRow }>(
    "PUT",
    `/api/blood-pressure/${id}`,
    body,
  );
}

export async function deleteBloodPressure(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/blood-pressure/${id}`);
}

export type FixedExpenseRow = S["FixedExpenseRow"];

export type FixedExpenseCreateBody = S["FixedExpenseCreate"];

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

export async function updateFixedExpense(id: string, body: { amount: number; description?: string | null }) {
  return sendJson<{ expense: FixedExpenseRow }>("PUT", `/api/fixed-expense/${id}`, body);
}

export async function deleteFixedExpense(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/fixed-expense/${id}`);
}

export type MonthlyExpenseRow = S["MonthlyExpenseRow"];

export type MonthlyExpenseCreateBody = S["MonthlyExpenseCreate"];

export type SearchResult = S["SearchResult"];

export async function searchRecords(q: string) {
  return getJson<{ results: SearchResult[] }>("/api/search", { q });
}

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

export async function updateMonthlyExpense(id: string, body: MonthlyExpenseCreateBody) {
  return sendJson<{ expense: MonthlyExpenseRow }>("PUT", `/api/monthly-expense/${id}`, body);
}

export async function deleteMonthlyExpense(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/monthly-expense/${id}`);
}

export type CalendarDayOverrideRow = S["CalendarDayOverrideRow"];

export async function getCalendarDayOverrides() {
  return getJson<{ overrides: CalendarDayOverrideRow[] }>("/api/calendar-day-override");
}

export async function bulkUpsertCalendarDayOverrides(
  overrides: { day: string; amount: number; saved?: number }[],
) {
  return sendJson<{ overrides: CalendarDayOverrideRow[] }>(
    "PUT",
    "/api/calendar-day-override/bulk",
    { overrides },
  );
}

export type PayPeriodStartOverrideRow = S["PayPeriodStartOverrideRow"];

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

export type PayslipDefaultFormDto = Omit<S["PayslipDefaultFormOut"], "period_half">;

export type PayslipDefaultsBundleDto = S["PayslipDefaultsBundle"];

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

export type CreditCardRow = S["CreditCardSummaryRow"];

export type CreditCardPaymentRow = S["CreditCardPaymentRow"];

export type CreditCardCreateBody = S["CreditCardCreate"];

export type CreditCardPaymentCreateBody = S["CreditCardPaymentCreate"];

// What a pay period's budget moved by, for the calendar's days to follow.
export type BudgetChange = S["BudgetChange"];

export type CreditCardBundle = S["CreditCardBundle"];

export async function getCreditCards() {
  return getJson<{ cards: CreditCardBundle[] }>("/api/credit-card");
}

export async function createCreditCard(body: CreditCardCreateBody) {
  return sendJson<{ card: CreditCardRow }>("POST", "/api/credit-card", body);
}

export async function updateCreditCard(id: string, body: CreditCardCreateBody) {
  return sendJson<{ card: CreditCardRow }>("PUT", `/api/credit-card/${id}`, body);
}

export async function deleteCreditCard(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/credit-card/${id}`);
}

export async function adjustCreditCardBalance(id: string, availableLimit: number) {
  return sendJson<{ card: CreditCardRow }>("PATCH", `/api/credit-card/${id}/balance`, {
    available_limit: availableLimit,
  });
}

export async function createCreditCardPayment(
  cardId: string,
  body: CreditCardPaymentCreateBody,
) {
  return sendJson<{ payment: CreditCardPaymentRow & { budget_changes: BudgetChange[] }; card: CreditCardRow }>(
    "POST",
    `/api/credit-card/${cardId}/payments`,
    body,
  );
}

export async function updateCreditCardPayment(paymentId: string, body: CreditCardPaymentCreateBody) {
  return sendJson<{ payment: CreditCardPaymentRow & { budget_changes: BudgetChange[] }; card: CreditCardRow }>(
    "PUT",
    `/api/credit-card/payments/${paymentId}`,
    body,
  );
}

export async function deleteCreditCardPayment(paymentId: string) {
  return sendJson<{ ok: boolean; budget_changes: BudgetChange[] }>(
    "DELETE",
    `/api/credit-card/payments/${paymentId}`,
  );
}

export type LottoGame = S["LottoGame"];

export async function getLottoGames() {
  return getJson<{ games: LottoGame[] }>("/api/lotto/games");
}

export type LottoDrawResult = S["LottoDrawResult"];

export async function getLottoCalendar(year: number, month: number) {
  return getJson<{ draws: LottoDrawResult[] }>("/api/lotto/calendar", { year, month });
}

export function lottoGameSlug(name: string): string {
  return name
    .replace(/\s*\d+\/\d+\s*$/, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export type LottoDrawRow = S["LottoDrawRow"];

export type LottoAttemptRow = S["LottoAttemptRow"];

export type LottoDrawDetail = S["LottoDrawDetail"];

export async function getLottoDraws(gameId: string, limit?: number) {
  return getJson<{ draws: LottoDrawDetail[] }>("/api/lotto", { game_id: gameId, limit });
}

export async function setLottoDraw(
  gameId: string,
  drawDate: string,
  numbers: number[] | null,
  jackpotPrize?: number | null,
  winners?: number,
) {
  return sendJson<LottoDrawDetail>("POST", "/api/lotto", {
    game_id: gameId,
    draw_date: drawDate,
    numbers,
    jackpot_prize: jackpotPrize ?? null,
    winners: winners ?? 0,
  });
}

export async function updateLottoDraw(
  gameId: string,
  drawId: string,
  drawDate: string,
  numbers: number[] | null,
  jackpotPrize?: number | null,
  winners?: number,
) {
  return sendJson<LottoDrawDetail>("PUT", `/api/lotto/${drawId}`, {
    game_id: gameId,
    draw_date: drawDate,
    numbers,
    jackpot_prize: jackpotPrize ?? null,
    winners: winners ?? 0,
  });
}

export async function deleteLottoDraw(drawId: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/lotto/${drawId}`);
}

export async function createLottoAttempt(
  drawId: string,
  numbers: number[],
  ticket?: number | null,
) {
  return sendJson<LottoDrawDetail>("POST", `/api/lotto/${drawId}/attempts`, {
    numbers,
    ticket: ticket ?? null,
  });
}

export async function createLottoAttemptsBulk(
  drawId: string,
  attempts: { numbers: number[]; ticket?: number | null }[],
) {
  return sendJson<LottoDrawDetail>("POST", `/api/lotto/${drawId}/attempts/bulk`, {
    attempts: attempts.map((a) => ({ numbers: a.numbers, ticket: a.ticket ?? null })),
  });
}

export async function updateLottoAttempt(
  drawId: string,
  attemptId: string,
  numbers: number[],
  ticket?: number | null,
) {
  return sendJson<LottoDrawDetail>(
    "PUT",
    `/api/lotto/${drawId}/attempts/${attemptId}`,
    { numbers, ticket: ticket ?? null },
  );
}

export async function deleteLottoAttempt(drawId: string, attemptId: string) {
  return sendJson<LottoDrawDetail>(
    "DELETE",
    `/api/lotto/${drawId}/attempts/${attemptId}`,
  );
}

export async function importLottoDrawResultsText(gameId: string, text: string) {
  return sendJson<{
    inserted: number;
    updated: number;
    total: number;
    errors: string[];
  }>("POST", "/api/lotto/import-text", { game_id: gameId, text });
}

export async function syncLottoResultsFromPcso() {
  return sendJson<{ inserted: number }>("POST", "/api/lotto/sync-pcso");
}

export type AppUserRow = {
  id: string;
  username: string;
  is_superuser: boolean;
  allowed_pages: string[] | null;
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

export type AppUserAccessBody = {
  is_superuser: boolean;
  allowed_pages: string[] | null;
};

export async function getAppUsers() {
  return getJson<{ users: AppUserRow[] }>("/api/users");
}

export async function createAppUser(body: AppUserCreateBody) {
  return sendJson<{ user: AppUserRow }>("POST", "/api/users", body);
}

export async function updateAppUser(id: string, body: AppUserUpdateBody) {
  return sendJson<{ user: AppUserRow }>("PUT", `/api/users/${id}`, body);
}

export async function updateAppUserAccess(id: string, body: AppUserAccessBody) {
  return sendJson<{ user: AppUserRow }>("PUT", `/api/users/${id}/access`, body);
}

export async function deleteAppUser(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/users/${id}`);
}

export async function verifyAppUserPassword(username: string, password: string) {
  return sendJson<{ valid: boolean }>("POST", "/api/users/verify", {
    username,
    password,
  });
}

export type PasskeyRow = S["PasskeyRow"];

export async function getPasskeys() {
  return getJson<{ passkeys: PasskeyRow[] }>("/api/auth/passkeys");
}

/** Asks this device to create a passkey for the logged-in user, then saves it. */
export async function addPasskey(name: string) {
  const options = await sendJson<PublicKeyCredentialCreationOptionsJSON>(
    "POST",
    "/api/auth/passkey/register/options",
  );
  const credential = await navigator.credentials.create({
    publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options),
  });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("No passkey was created.");
  return sendJson<{ passkey: PasskeyRow }>("POST", "/api/auth/passkey/register", {
    credential: credential.toJSON(),
    name,
  });
}

export async function deletePasskey(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/auth/passkeys/${id}`);
}

export type CompanyColumnFlags = {
  show_total: boolean;
  show_basic_salary: boolean;
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
  show_bereavement_asst: boolean;
};

export type CompanyRow = S["CompanyRow"];

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
  show_bereavement_asst: false,
};

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
    show_bereavement_asst: c.show_bereavement_asst,
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

export async function updateCompany(id: string, name: string, flags: CompanyColumnFlags) {
  return sendJson<{ company: CompanyRow }>("PUT", `/api/companies/${id}`, {
    name,
    ...flags,
  });
}

export async function deleteCompany(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/companies/${id}`);
}

export async function reorderCompanies(ids: string[]) {
  return sendJson<{ companies: CompanyRow[] }>("PUT", "/api/companies/reorder", { ids });
}

export type TravelTripRow = S["TravelTripRow"];

export type TravelCityRow = S["TravelCityRow"];

export type TravelFlightRow = S["TravelFlightRow"];

export type TravelTransportRow = S["TravelTransportRow"];

export type TravelItineraryRow = S["TravelItineraryRow"];

export type TravelAccommodationRow = S["TravelAccommodationRow"];

export type TravelTripDetail = S["TravelTripDetail"];

export type TravelTripCreateBody = S["TravelTripCreate"];

export type TravelCityBody = S["TravelCityCreate"];

export type TravelFlightBody = S["TravelFlightCreate"];

export type TravelTransportBody = S["TravelTransportCreate"];

export type TravelItineraryBody = S["TravelItineraryCreate"];

export type TravelAccommodationBody = S["TravelAccommodationCreate"];

export async function getTravelTrips(limit?: number) {
  return getJson<{ trips: TravelTripDetail[] }>("/api/travel", { limit });
}

export async function resolveMapLink(url: string) {
  return getJson<{ name: string | null; city: string | null; country: string | null }>(
    "/api/travel/resolve-map-link",
    { url },
  );
}

export async function createTravelTrip(body: TravelTripCreateBody) {
  return sendJson<TravelTripDetail>("POST", "/api/travel", body);
}

export async function updateTravelTrip(tripId: string, body: TravelTripCreateBody) {
  return sendJson<TravelTripDetail>("PUT", `/api/travel/${tripId}`, body);
}

export async function deleteTravelTrip(tripId: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/travel/${tripId}`);
}

export async function createTravelFlight(tripId: string, body: TravelFlightBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/flights`, body);
}

export async function updateTravelFlight(
  tripId: string,
  flightId: string,
  body: TravelFlightBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/flights/${flightId}`,
    body,
  );
}

export async function deleteTravelFlight(tripId: string, flightId: string) {
  return sendJson<TravelTripDetail>("DELETE", `/api/travel/${tripId}/flights/${flightId}`);
}

export async function createTravelTransport(tripId: string, body: TravelTransportBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/transport`, body);
}

export async function updateTravelTransport(
  tripId: string,
  transportId: string,
  body: TravelTransportBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/transport/${transportId}`,
    body,
  );
}

export async function deleteTravelTransport(tripId: string, transportId: string) {
  return sendJson<TravelTripDetail>(
    "DELETE",
    `/api/travel/${tripId}/transport/${transportId}`,
  );
}

export async function createTravelItinerary(tripId: string, body: TravelItineraryBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/itinerary`, body);
}

export async function updateTravelItinerary(
  tripId: string,
  itemId: string,
  body: TravelItineraryBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/itinerary/${itemId}`,
    body,
  );
}

export async function deleteTravelItinerary(tripId: string, itemId: string) {
  return sendJson<TravelTripDetail>("DELETE", `/api/travel/${tripId}/itinerary/${itemId}`);
}

export async function createTravelAccommodation(
  tripId: string,
  body: TravelAccommodationBody,
) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/accommodations`, body);
}

export async function updateTravelAccommodation(
  tripId: string,
  accommodationId: string,
  body: TravelAccommodationBody,
) {
  return sendJson<TravelTripDetail>(
    "PUT",
    `/api/travel/${tripId}/accommodations/${accommodationId}`,
    body,
  );
}

export async function deleteTravelAccommodation(tripId: string, accommodationId: string) {
  return sendJson<TravelTripDetail>(
    "DELETE",
    `/api/travel/${tripId}/accommodations/${accommodationId}`,
  );
}

export async function createTravelCity(tripId: string, body: TravelCityBody) {
  return sendJson<TravelTripDetail>("POST", `/api/travel/${tripId}/cities`, body);
}

export async function updateTravelCity(tripId: string, cityId: string, body: TravelCityBody) {
  return sendJson<TravelTripDetail>("PUT", `/api/travel/${tripId}/cities/${cityId}`, body);
}

export async function deleteTravelCity(tripId: string, cityId: string) {
  return sendJson<TravelTripDetail>("DELETE", `/api/travel/${tripId}/cities/${cityId}`);
}

/** A day counted from the month a bill is added: next month's 8th is { months: 1, day: 8 }. */
export type RelativeDay = S["RelativeDay"];

export type BillDefaults = S["BillDefaults"];

export type BillCategoryRow = S["BillCategoryRow"];

export type BillCategoryBody = S["BillCategoryCreate"];

export type BillRow = S["BillRow"];

export type BillBody = S["BillCreate"];

export async function getBills() {
  return getJson<{ categories: BillCategoryRow[]; bills: BillRow[] }>("/api/bill");
}

export async function createBillCategory(body: BillCategoryBody) {
  return sendJson<{ category: BillCategoryRow }>("POST", "/api/bill-category", body);
}

export async function updateBillCategory(id: string, body: BillCategoryBody) {
  return sendJson<{ category: BillCategoryRow }>("PUT", `/api/bill-category/${id}`, body);
}

export async function deleteBillCategory(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/bill-category/${id}`);
}

export async function createBill(body: BillBody) {
  return sendJson<{ bill: BillRow }>("POST", "/api/bill", body);
}

export async function updateBill(id: string, body: BillBody) {
  return sendJson<{ bill: BillRow }>("PUT", `/api/bill/${id}`, body);
}

export async function deleteBill(id: string) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/bill/${id}`);
}

export function billPdfUrl(id: string): string {
  return `${dataApiBase()}/api/bill/${id}/pdf`;
}

export async function uploadBillPdf(id: string, file: File) {
  return uploadPdf(`/api/bill/${id}/pdf`, file);
}

export type BillPdfFields = S["BillPdfFields"];

// Reads a PDF, or a PNG or JPG photo, of a bill.
export async function readBillPdf(file: File, categoryId: string) {
  return uploadPdf<BillPdfFields>(`/api/bill/extract?category_id=${categoryId}`, file);
}
