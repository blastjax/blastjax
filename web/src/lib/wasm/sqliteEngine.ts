/**
 * Browser SQLite via sql.js + optional IndexedDB persistence (GitHub Pages / static export).
 */
import type { Database } from "sql.js";

const IDB_NAME = "budgetapp-wasm-sqlite";
const IDB_STORE = "file";
const IDB_KEY = "budget.sqlite";

let sqlModule: Awaited<ReturnType<typeof import("sql.js").default>> | null = null;
let dbPromise: Promise<Database> | null = null;

function basePathPrefix(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
}

function wasmLocateFile(file: string): string {
  return `${basePathPrefix()}/sqljs/${file}`;
}

function budgetSqliteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_WASM_SQLITE_URL?.trim();
  if (raw) return raw;
  return `${basePathPrefix()}/budget.sqlite`;
}

/** Minimal schema when no seed file exists (payslip + installments only). */
export const WASM_MINIMAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS payslip (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL,
  commission REAL,
  reimbursement REAL,
  medical_reimbursement REAL,
  others REAL,
  mp2 REAL,
  allowances REAL,
  period_year INTEGER,
  period_month INTEGER,
  period_half INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS installment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  installment_current INTEGER NOT NULL,
  installment_total INTEGER NOT NULL,
  principal REAL NOT NULL,
  interest REAL,
  payment_total REAL NOT NULL,
  start_date TEXT NOT NULL,
  finish_date TEXT NOT NULL,
  remaining REAL NOT NULL,
  original_total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT chk_installment_n CHECK (
    installment_total >= 1
    AND installment_current >= 1
    AND installment_current <= installment_total + 1
  ),
  CONSTRAINT chk_installment_amounts CHECK (payment_total > 0 AND remaining >= 0)
);
CREATE TABLE IF NOT EXISTS installment_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installment_id INTEGER NOT NULL REFERENCES installment(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  principal REAL NOT NULL DEFAULT 0,
  interest REAL,
  payment_total REAL NOT NULL,
  UNIQUE (installment_id, seq)
);
`;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(IDB_STORE)) {
        r.result.createObjectStore(IDB_STORE);
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => {
      const v = req.result;
      resolve(v instanceof Uint8Array ? v : null);
    };
    req.onerror = () => reject(req.error ?? new Error("idb get"));
  });
}

async function idbSet(data: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb put"));
  });
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleWasmDbPersist(db: Database): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const data = db.export();
      void idbSet(data);
    } catch {
      /* ignore */
    }
  }, 450);
}

async function loadSqlJs(): Promise<Awaited<ReturnType<typeof import("sql.js").default>>> {
  if (sqlModule) return sqlModule;
  const init = (await import("sql.js")).default;
  sqlModule = await init({
    locateFile: wasmLocateFile,
  });
  return sqlModule;
}

async function loadInitialBuffer(): Promise<Uint8Array | undefined> {
  const fromIdb = await idbGet();
  if (fromIdb && fromIdb.byteLength > 0) return fromIdb;
  const url = budgetSqliteUrl();
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > 0) return buf;
    }
  } catch {
    /* no seed file */
  }
  return undefined;
}

export function wasmSqliteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_WASM_SQLITE === "1";
}

export function ensureWasmDatabase(): Promise<Database> {
  if (!wasmSqliteEnabled()) {
    return Promise.reject(new Error("WASM SQLite is not enabled"));
  }
  if (typeof window === "undefined") {
    return Promise.reject(new Error("WASM SQLite is browser-only"));
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await loadSqlJs();
      const buf = await loadInitialBuffer();
      const db = buf ? new SQL.Database(buf) : new SQL.Database();
      if (!buf) {
        db.run(WASM_MINIMAL_SCHEMA);
        scheduleWasmDbPersist(db);
      }
      return db;
    })();
  }
  return dbPromise;
}

export function resetWasmDatabaseForTests(): void {
  dbPromise = null;
}
