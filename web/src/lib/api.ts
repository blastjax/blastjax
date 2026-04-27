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
  const p = new URLSearchParams();
  if (limit != null) p.set("limit", String(limit));
  const qs = p.toString();
  return j<{ payslips: PayslipRow[] }>(
    await apiFetch(`${dataApiBase()}/api/payslip${qs ? `?${qs}` : ""}`, { cache: "no-store" }),
  );
}

export async function createPayslip(body: PayslipCreateBody) {
  return j<{ id: number }>(
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
