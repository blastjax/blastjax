/**
 * Emulates FastAPI routes for installment + payslip using sql.js (GitHub Pages).
 */
import type { Database } from "sql.js";
import {
  ensureWasmDatabase,
  scheduleWasmDbPersist,
  wasmSqliteEnabled,
} from "./sqliteEngine";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function all(db: Database, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: Record<string, unknown>[] = [];
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  return out;
}

function getOne(db: Database, sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = all(db, sql, params);
  return rows[0] ?? null;
}

function run(db: Database, sql: string, params: unknown[] = []): void {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function lastInsertRowid(db: Database): number {
  const r = getOne(db, "SELECT last_insert_rowid() AS i", []);
  return Number(r?.i ?? 0);
}

function basePathPrefix(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

function serializeInstallmentRow(r: Record<string, unknown>): Record<string, unknown> {
  const o = { ...r };
  for (const k of ["start_date", "finish_date", "created_at"]) {
    const v = o[k];
    if (v != null && typeof v === "object" && "toISOString" in (v as object)) {
      o[k] = (v as Date).toISOString();
    }
  }
  return o;
}

function coerceDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "string" && v.length >= 10) {
    const d = new Date(v.slice(0, 10));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function installmentMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function installmentAddMonths(d: Date, months: number): Date {
  const x = installmentMonthStart(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function installmentDueThisMonth(
  start: Date,
  current: number,
  total: number,
  today = new Date(),
): boolean {
  if (current < 1 || current > total) return false;
  const s = installmentMonthStart(start);
  const due = installmentAddMonths(s, current);
  return due.getFullYear() === today.getFullYear() && due.getMonth() === today.getMonth();
}

function installmentSummary(rows: Record<string, unknown>[]) {
  let sumOriginal = 0;
  let sumRemaining = 0;
  let dueMonth = 0;
  for (const r of rows) {
    sumOriginal += Number(r.original_total ?? 0);
    sumRemaining += Number(r.remaining ?? 0);
    const start = coerceDate(r.start_date);
    const cur = Number(r.installment_current ?? 0);
    const total = Number(r.installment_total ?? 0);
    const pay = Number(r.due_payment ?? r.payment_total ?? 0);
    const rem = Number(r.remaining ?? 0);
    if (
      start &&
      cur <= total &&
      cur >= 1 &&
      rem > 0 &&
      installmentDueThisMonth(start, cur, total)
    ) {
      dueMonth += pay;
    }
  }
  return {
    sum_original_total: sumOriginal,
    sum_remaining: sumRemaining,
    due_this_month: dueMonth,
  };
}

function linePaymentTotal(principal: number, interest: number | null): number {
  return principal + (interest != null ? Number(interest) : 0);
}

function recomputeInstallmentAggregates(db: Database, installmentId: number): void {
  const curRow = getOne(
    db,
    "SELECT installment_current FROM installment WHERE id = ?",
    [installmentId],
  );
  if (!curRow) return;
  const current = Number(curRow.installment_current);
  const origRow = getOne(
    db,
    "SELECT COALESCE(SUM(payment_total), 0) AS s FROM installment_line WHERE installment_id = ?",
    [installmentId],
  );
  const orig = Number(origRow?.s ?? 0);
  const remRow = getOne(
    db,
    `SELECT COALESCE(SUM(payment_total), 0) AS s FROM installment_line
     WHERE installment_id = ? AND seq >= ?`,
    [installmentId, current],
  );
  const rem = Number(remRow?.s ?? 0);
  const ln = getOne(
    db,
    "SELECT principal, interest, payment_total FROM installment_line WHERE installment_id = ? AND seq = ?",
    [installmentId, current],
  );
  if (ln) {
    run(
      db,
      `UPDATE installment SET
        original_total = ?, remaining = ?, principal = ?, interest = ?, payment_total = ?
       WHERE id = ?`,
      [orig, rem, ln.principal, ln.interest, Number(ln.payment_total), installmentId],
    );
  } else {
    run(db, "UPDATE installment SET original_total = ?, remaining = ? WHERE id = ?", [
      orig,
      rem,
      installmentId,
    ]);
  }
}

function seedInstallmentLines(
  db: Database,
  installmentId: number,
  installmentTotal: number,
  principal: number,
  interest: number | null,
): void {
  const ptot = linePaymentTotal(principal, interest);
  for (let seq = 1; seq <= installmentTotal; seq++) {
    run(
      db,
      `INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
       VALUES (?, ?, ?, ?, ?)`,
      [installmentId, seq, principal, interest, ptot],
    );
  }
}

function resyncInstallmentLinesOnTotalChange(
  db: Database,
  installmentId: number,
  newTotal: number,
  principal: number,
  interest: number | null,
): void {
  const ptot = linePaymentTotal(principal, interest);
  run(db, "DELETE FROM installment_line WHERE installment_id = ? AND seq > ?", [
    installmentId,
    newTotal,
  ]);
  for (let seq = 1; seq <= newTotal; seq++) {
    run(
      db,
      `INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (installment_id, seq) DO UPDATE SET
         principal = excluded.principal,
         interest = excluded.interest,
         payment_total = excluded.payment_total`,
      [installmentId, seq, principal, interest, ptot],
    );
  }
}

async function readJsonBody(init?: RequestInit): Promise<unknown> {
  const b = init?.body;
  if (b == null) return undefined;
  if (typeof b === "string") return JSON.parse(b) as unknown;
  return undefined;
}

function apiPathFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    let p = u.pathname + u.search;
    const bp = basePathPrefix();
    if (bp && p.startsWith(bp)) {
      p = p.slice(bp.length);
      if (!p.startsWith("/")) p = `/${p}`;
    }
    if (!p.startsWith("/api/")) return null;
    return p;
  } catch {
    return null;
  }
}

export async function tryWasmApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  if (!wasmSqliteEnabled() || typeof window === "undefined") return null;

  let urlStr: string;
  let method = (init?.method ?? "GET").toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    urlStr = input.url;
    method = input.method.toUpperCase();
  } else {
    urlStr = String(input);
  }

  const pathWithQuery = apiPathFromUrl(urlStr);
  if (!pathWithQuery) return null;

  const db = await ensureWasmDatabase();
  const pathname = pathWithQuery.split("?")[0];
  const search = pathWithQuery.includes("?")
    ? new URLSearchParams(pathWithQuery.slice(pathWithQuery.indexOf("?")))
    : new URLSearchParams();

  try {
    if (pathname === "/api/health" && method === "GET") {
      return jsonResponse({
        status: "ok",
        storage: "wasm-sqlite",
        database: "up",
      });
    }

    if (pathname === "/api/installment" && method === "GET") {
      const limit = Math.min(2000, Math.max(1, Number(search.get("limit") ?? "500")));
      const rows = all(
        db,
        `SELECT i.id, i.name, i.installment_current, i.installment_total,
            i.principal, i.interest, i.payment_total, i.start_date, i.finish_date,
            i.remaining, i.original_total, i.created_at,
            COALESCE(il.payment_total, i.payment_total) AS due_payment
         FROM installment i
         LEFT JOIN installment_line il
           ON il.installment_id = i.id AND il.seq = i.installment_current
         ORDER BY i.finish_date ASC, i.name ASC
         LIMIT ?`,
        [limit],
      );
      const serialized = rows.map((r) => serializeInstallmentRow(r));
      return jsonResponse({
        installments: serialized,
        summary: installmentSummary(serialized),
      });
    }

    if (pathname === "/api/installment" && method === "POST") {
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      const name = String(body.name ?? "").trim();
      const installment_current = Number(body.installment_current);
      const installment_total = Number(body.installment_total);
      const principal = Number(body.principal);
      const interest =
        body.interest === undefined || body.interest === null
          ? null
          : Number(body.interest);
      const payment_total = Number(body.payment_total);
      const start_date = String(body.start_date ?? "");
      const finish_date = String(body.finish_date ?? "");
      const paymentsLeft = installment_total - installment_current + 1;
      const remaining =
        body.remaining != null && body.remaining !== ""
          ? Number(body.remaining)
          : paymentsLeft * payment_total;
      const original_total =
        body.original_total != null && body.original_total !== ""
          ? Number(body.original_total)
          : installment_total * payment_total;
      run(
        db,
        `INSERT INTO installment (
          name, installment_current, installment_total,
          principal, interest, payment_total, start_date, finish_date, remaining, original_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          installment_current,
          installment_total,
          principal,
          interest,
          payment_total,
          start_date,
          finish_date,
          remaining,
          original_total,
        ],
      );
      const iid = lastInsertRowid(db);
      seedInstallmentLines(db, iid, installment_total, principal, interest);
      recomputeInstallmentAggregates(db, iid);
      scheduleWasmDbPersist(db);
      return jsonResponse({ id: iid });
    }

    const mOne = /^\/api\/installment\/(\d+)$/.exec(pathname);
    if (mOne && method === "GET") {
      const id = Number(mOne[1]);
      const row = getOne(
        db,
        `SELECT id, name, installment_current, installment_total,
            principal, interest, payment_total, start_date, finish_date,
            remaining, original_total, created_at
         FROM installment WHERE id = ?`,
        [id],
      );
      if (!row) return jsonResponse({ detail: "Installment not found." }, 404);
      const lines = all(
        db,
        `SELECT seq, principal, interest, payment_total
         FROM installment_line WHERE installment_id = ? ORDER BY seq ASC`,
        [id],
      );
      return jsonResponse({
        installment: serializeInstallmentRow(row),
        lines,
      });
    }

    if (mOne && method === "PUT") {
      const id = Number(mOne[1]);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      const oldT = getOne(db, "SELECT installment_total FROM installment WHERE id = ?", [id]);
      if (!oldT) return jsonResponse({ detail: "Installment not found." }, 404);
      const oldTotal = Number(oldT.installment_total);
      const name = String(body.name ?? "").trim();
      const installment_current = Number(body.installment_current);
      const installment_total = Number(body.installment_total);
      const principal = Number(body.principal);
      const interest =
        body.interest === undefined || body.interest === null
          ? null
          : Number(body.interest);
      const payment_total = Number(body.payment_total);
      const start_date = String(body.start_date ?? "");
      const finish_date = String(body.finish_date ?? "");
      const paymentsLeft = installment_total - installment_current + 1;
      const remaining =
        body.remaining != null && body.remaining !== ""
          ? Number(body.remaining)
          : paymentsLeft * payment_total;
      const original_total =
        body.original_total != null && body.original_total !== ""
          ? Number(body.original_total)
          : installment_total * payment_total;
      run(
        db,
        `UPDATE installment SET
          name = ?, installment_current = ?, installment_total = ?,
          principal = ?, interest = ?, payment_total = ?,
          start_date = ?, finish_date = ?, remaining = ?, original_total = ?
         WHERE id = ?`,
        [
          name,
          installment_current,
          installment_total,
          principal,
          interest,
          payment_total,
          start_date,
          finish_date,
          remaining,
          original_total,
          id,
        ],
      );
      const cnt = getOne(
        db,
        "SELECT COUNT(*) AS c FROM installment_line WHERE installment_id = ?",
        [id],
      );
      const hasLines = Number(cnt?.c ?? 0) > 0;
      if (hasLines && oldTotal !== installment_total) {
        resyncInstallmentLinesOnTotalChange(
          db,
          id,
          installment_total,
          principal,
          interest,
        );
      }
      if (hasLines) recomputeInstallmentAggregates(db, id);
      scheduleWasmDbPersist(db);
      return jsonResponse({ id });
    }

    if (mOne && method === "DELETE") {
      const id = Number(mOne[1]);
      run(db, "DELETE FROM installment WHERE id = ?", [id]);
      const ok = db.getRowsModified() > 0;
      if (!ok) return jsonResponse({ detail: "Installment not found." }, 404);
      scheduleWasmDbPersist(db);
      return jsonResponse({ ok: true });
    }

    const mPay = /^\/api\/installment\/(\d+)\/pay$/.exec(pathname);
    if (mPay && method === "POST") {
      const installment_id = Number(mPay[1]);
      const row = getOne(
        db,
        `SELECT id, installment_current, installment_total, payment_total, remaining
         FROM installment WHERE id = ?`,
        [installment_id],
      );
      if (!row)
        return jsonResponse(
          {
            detail:
              "Cannot record payment (not found, already complete, or no balance).",
          },
          400,
        );
      const curN = Number(row.installment_current);
      const totalN = Number(row.installment_total);
      const pay = Number(row.payment_total);
      const rem = Number(row.remaining);
      if (curN > totalN || rem <= 0) {
        return jsonResponse(
          {
            detail:
              "Cannot record payment (not found, already complete, or no balance).",
          },
          400,
        );
      }
      const newCur = curN + 1;
      run(db, "UPDATE installment SET installment_current = ? WHERE id = ?", [
        newCur,
        installment_id,
      ]);
      const lc = getOne(
        db,
        "SELECT COUNT(*) AS c FROM installment_line WHERE installment_id = ?",
        [installment_id],
      );
      const hasLines = Number(lc?.c ?? 0) > 0;
      if (hasLines) {
        recomputeInstallmentAggregates(db, installment_id);
      } else {
        const newRem = Math.max(0, rem - pay);
        run(db, "UPDATE installment SET remaining = ? WHERE id = ?", [
          newRem,
          installment_id,
        ]);
      }
      const out = getOne(
        db,
        `SELECT id, name, installment_current, installment_total,
            principal, interest, payment_total, start_date, finish_date,
            remaining, original_total, created_at
         FROM installment WHERE id = ?`,
        [installment_id],
      );
      scheduleWasmDbPersist(db);
      return jsonResponse({ installment: serializeInstallmentRow(out!) });
    }

    const mLine = /^\/api\/installment\/(\d+)\/line\/(\d+)$/.exec(pathname);
    if (mLine && method === "PUT") {
      const installmentId = Number(mLine[1]);
      const seq = Number(mLine[2]);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      const principal = Number(body.principal);
      const interest =
        body.interest === undefined || body.interest === null
          ? null
          : Number(body.interest);
      const ptot = linePaymentTotal(principal, interest);
      run(
        db,
        `UPDATE installment_line SET principal = ?, interest = ?, payment_total = ?
         WHERE installment_id = ? AND seq = ?`,
        [principal, interest, ptot, installmentId, seq],
      );
      if (db.getRowsModified() === 0)
        return jsonResponse({ detail: "Schedule line not found." }, 404);
      recomputeInstallmentAggregates(db, installmentId);
      const row = getOne(
        db,
        `SELECT id, name, installment_current, installment_total,
            principal, interest, payment_total, start_date, finish_date,
            remaining, original_total, created_at
         FROM installment WHERE id = ?`,
        [installmentId],
      );
      const lines = all(
        db,
        `SELECT seq, principal, interest, payment_total
         FROM installment_line WHERE installment_id = ? ORDER BY seq ASC`,
        [installmentId],
      );
      scheduleWasmDbPersist(db);
      return jsonResponse({
        installment: serializeInstallmentRow(row!),
        lines,
      });
    }

    if (pathname === "/api/payslip" && method === "GET") {
      const limit = Math.min(2000, Math.max(1, Number(search.get("limit") ?? "1000")));
      const rows = all(
        db,
        `SELECT id, total, commission, reimbursement,
            medical_reimbursement, others, mp2, allowances,
            period_year, period_month, period_half, notes, created_at
         FROM payslip
         ORDER BY period_year DESC NULLS LAST,
                  period_month DESC NULLS LAST,
                  period_half DESC NULLS LAST,
                  created_at DESC
         LIMIT ?`,
        [limit],
      );
      for (const r of rows) {
        const ca = r.created_at;
        if (ca != null && typeof ca === "object" && "toISOString" in (ca as object)) {
          r.created_at = (ca as Date).toISOString();
        }
      }
      return jsonResponse({ payslips: rows });
    }

    if (pathname === "/api/payslip" && method === "POST") {
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      run(
        db,
        `INSERT INTO payslip (
          total, commission, reimbursement,
          medical_reimbursement, others, mp2, allowances,
          period_year, period_month, period_half, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.total ?? null,
          body.commission ?? null,
          body.reimbursement ?? null,
          body.medical_reimbursement ?? null,
          body.others ?? null,
          body.mp2 ?? null,
          body.allowances ?? null,
          body.period_year ?? null,
          body.period_month ?? null,
          body.period_half ?? null,
          body.notes ?? null,
        ],
      );
      const pid = lastInsertRowid(db);
      const out: Record<string, unknown> = { id: pid };
      scheduleWasmDbPersist(db);
      return jsonResponse(out);
    }

    const mP = /^\/api\/payslip\/(\d+)$/.exec(pathname);
    if (mP && method === "GET") {
      const id = Number(mP[1]);
      const row = getOne(
        db,
        `SELECT id, total, commission, reimbursement,
            medical_reimbursement, others, mp2, allowances,
            period_year, period_month, period_half, notes, created_at
         FROM payslip WHERE id = ?`,
        [id],
      );
      if (!row) return jsonResponse({ detail: "Not found" }, 404);
      return jsonResponse(row);
    }

    if (mP && method === "PUT") {
      const id = Number(mP[1]);
      const body = (await readJsonBody(init)) as Record<string, unknown>;
      run(
        db,
        `UPDATE payslip SET
          total = ?, commission = ?, reimbursement = ?, medical_reimbursement = ?,
          others = ?, mp2 = ?, allowances = ?,
          period_year = ?, period_month = ?, period_half = ?, notes = ?
         WHERE id = ?`,
        [
          body.total ?? null,
          body.commission ?? null,
          body.reimbursement ?? null,
          body.medical_reimbursement ?? null,
          body.others ?? null,
          body.mp2 ?? null,
          body.allowances ?? null,
          body.period_year ?? null,
          body.period_month ?? null,
          body.period_half ?? null,
          body.notes ?? null,
          id,
        ],
      );
      if (db.getRowsModified() === 0) return jsonResponse({ detail: "Not found" }, 404);
      scheduleWasmDbPersist(db);
      return jsonResponse({ id });
    }

    if (mP && method === "DELETE") {
      const id = Number(mP[1]);
      run(db, "DELETE FROM payslip WHERE id = ?", [id]);
      if (db.getRowsModified() === 0) return jsonResponse({ detail: "Not found" }, 404);
      scheduleWasmDbPersist(db);
      return jsonResponse({ ok: true });
    }

    return jsonResponse(
      {
        detail:
          "WASM SQLite mode only implements health, payslip, and installment APIs. Run the FastAPI server for other features.",
      },
      501,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ detail: msg }, 500);
  }
}
