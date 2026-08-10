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
  return fetch(input, init);
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
  has_pdf?: boolean;
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
};

export async function getPayslips(limit?: number) {
  return getJson<{ payslips: PayslipRow[] }>("/api/payslip", { limit });
}

export async function createPayslip(body: PayslipCreateBody) {
  return sendJson<PayslipRow>("POST", "/api/payslip", body);
}

export async function getPayslip(id: number) {
  return getJson<PayslipRow>(`/api/payslip/${id}`);
}

export async function updatePayslip(id: number, body: PayslipCreateBody) {
  return sendJson<PayslipRow>("PUT", `/api/payslip/${id}`, body);
}

export async function deletePayslip(id: number) {
  return sendJson<{ ok: boolean }>("DELETE", `/api/payslip/${id}`);
}

export async function importPayslipJson(data: Record<string, unknown>) {
  return sendJson<{ filename: string; inserted: number; ids: number[] }>(
    "POST",
    "/api/payslip/import-json",
    data,
  );
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

export async function updateInstallmentLine(
  installmentId: number,
  seq: number,
  body: { principal: number; interest: number | null },
) {
  return sendJson<InstallmentDetailResponse>(
    "PUT",
    `/api/installment/${installmentId}/line/${seq}`,
    body,
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
