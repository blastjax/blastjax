# Node web:lib:api: lib/api.ts
Kind: module
Language: typescript, 1555 lines of code, location: web/src/lib/api.ts

Source excerpt: web/src/lib/api.ts (first 150 lines)
```
   1  import { AUTH_UNAUTHORIZED_EVENT, clearSessionToken, getSessionToken } from "@/lib/auth";
   2  
   3  export function dataApiBase(): string {
   4    const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim();
   5    return rawApi && rawApi.length > 0 ? rawApi.replace(/\/$/, "") : "";
   6  }
   7  
   8  export async function apiFetch(
   9    input: RequestInfo | URL,
  10    init?: RequestInit,
  11  ): Promise<Response> {
  12    const token = getSessionToken();
  13    const headers = new Headers(init?.headers);
  14    if (token) headers.set("Authorization", `Bearer ${token}`);
  15    const res = await fetch(input, { ...init, headers });
  16    if (res.status === 401) {
  17      clearSessionToken();
  18      if (typeof window !== "undefined") {
  19        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
  20      }
  21    }
  22    return res;
  23  }
  24  
  25  function messageFromErrorResponseBody(text: string): string {
  26    const trimmed = text.trim();
  27    if (!trimmed) return "";
  28    try {
  29      const parsed = JSON.parse(trimmed) as unknown;
  30      if (typeof parsed !== "object" || parsed === null) return trimmed;
  31      const o = parsed as Record<string, unknown>;
  32      if (typeof o.detail === "string") return o.detail;
  33      if (Array.isArray(o.detail)) {
  34        const parts = o.detail
  35          .map((item) => {
  36            if (typeof item === "string") return item;
  37            if (item && typeof item === "object" && "msg" in item) {
  38              return String((item as { msg?: string }).msg ?? "").replace(/^Value error, /, "");
  39            }
  40            return "";
  41          })
  42          .filter(Boolean);
  43        if (parts.length) return parts.join("; ");
  44      }
  45    } catch {
  46    }
  47    return trimmed;
  48  }
  49  
  50  async function j<T>(res: Response): Promise<T> {
  51    if (!res.ok) {
  52      const t = await res.text();
  53      const msg = messageFromErrorResponseBody(t) || res.statusText;
  54      throw new Error(msg);
  55    }
  56    return res.json() as Promise<T>;
  57  }
  58  
  59  const JSON_HEADERS = { "Content-Type": "application/json" } as const;
  60  
  61  function qs(params: Record<string, string | number | undefined>): string {
  62    const p = new URLSearchParams();
  63    for (const [k, v] of Object.entries(params)) {
  64      if (v != null) p.set(k, String(v));
  65    }
  66    const s = p.toString();
  67    return s ? `?${s}` : "";
  68  }
  69  
  70  async function getJson<T>(path: string, query?: Record<string, string | number | undefined>) {
  71    return j<T>(
  72      await apiFetch(`${dataApiBase()}${path}${query ? qs(query) : ""}`, {
  73        cache: "no-store",
  74      }),
  75    );
  76  }
  77  
  78  async function sendJson<T>(
  79    method: "POST" | "PUT" | "PATCH" | "DELETE",
  80    path: string,
  81    body?: unknown,
  82  ) {
  83    const init: RequestInit = { method };
  84    if (body !== undefined) {
  85      init.headers = JSON_HEADERS;
  86      init.body = JSON.stringify(body);
  87    }
  88    return j<T>(await apiFetch(`${dataApiBase()}${path}`, init));
  89  }
  90  
  91  export type PayslipRow = {
  92    id: string;
  93    company: string;
  94    total: number | null;
  95    commission: number | null;
  96    reimbursement: number | null;
  97    medical_reimbursement: number | null;
  98    others: number | null;
  99    mp2: number | null;
 100    allowances: number | null;
 101    thirteenth_month: number | null;
 102    basic_salary: number | null;
 103    period_year: number | null;
 104    period_month: number | null;
 105    period_half: number | null;
 106    notes: string | null;
 107    withholding_tax: number | null;
 108    sss_contribution: number | null;
 109    philhealth: number | null;
 110    pag_ibig: number | null;
 111    bereavement_asst: number | null;
 112    has_pdf?: boolean;
 113    created_at: string;
 114  };
 115  
 116  export type PayslipCreateBody = {
 117    company: string;
 118    total?: number | null;
 119    commission?: number | null;
 120    reimbursement?: number | null;
 121    medical_reimbursement?: number | null;
 122    others?: number | null;
 123    mp2?: number | null;
 124    allowances?: number | null;
 125    thirteenth_month?: number | null;
 126    basic_salary?: number | null;
 127    period_year?: number | null;
 128    period_month?: number | null;
 129    period_half?: number | null;
 130    notes?: string | null;
 131    withholding_tax?: number | null;
 132    sss_contribution?: number | null;
 133    philhealth?: number | null;
 134    pag_ibig?: number | null;
 135    bereavement_asst?: number | null;
 136  };
 137  
 138  export async function getPayslips(limit?: number, company?: string) {
 139    return getJson<{ payslips: PayslipRow[] }>("/api/payslip", { limit, company });
 140  }
 141  
 142  export async function createPayslip(body: PayslipCreateBody) {
 143    return sendJson<PayslipRow>("POST", "/api/payslip", body);
 144  }
 145  
 146  export async function updatePayslip(id: string, body: PayslipCreateBody) {
 147    return sendJson<PayslipRow>("PUT", `/api/payslip/${id}`, body);
 148  }
 149  
 150  export async function deletePayslip(id: string) {
```

## Outgoing connections
- dispatch -> routers/auth.py (be:router:auth)
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/blood_pressure.py (be:router:blood_pressure)
- dispatch -> routers/calendar_day_override.py (be:router:calendar_day_override)
- dispatch -> routers/company.py (be:router:company)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/fixed_expense.py (be:router:fixed_expense)
- dispatch -> routers/house_payment.py (be:router:house_payment)
- dispatch -> routers/installment.py (be:router:installment)
- dispatch -> routers/lotto.py (be:router:lotto)
- dispatch -> routers/mambo.py (be:router:mambo)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/mosaic.py (be:router:mosaic)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- dispatch -> routers/payslip.py (be:router:payslip)
- dispatch -> routers/payslip_default.py (be:router:payslip_default)
- dispatch -> routers/search.py (be:router:search)
- dispatch -> routers/travel.py (be:router:travel)
- dispatch -> routers/user.py (be:router:user)
- call -> lib/auth.ts (web:lib:auth)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/AuthGate.tsx (web:components:AuthGate) -> call
- components/CompanyRedirect.tsx (web:components:CompanyRedirect) -> call
- components/Header.tsx (web:components:Header) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- /credit-card (web:credit-card) -> call
- /games/mambo (web:games/mambo) -> call
- /games/mosaic (web:games/mosaic) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- lib/payPeriods.ts (web:lib:payPeriods) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
- /settings (web:settings) -> call
- /travels (web:travels) -> call
