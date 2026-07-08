"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPayslips,
  uploadPayslipPdf,
  type PayslipRow,
} from "@/lib/api";
import { rowsForSlot } from "@/app/payslip/payslipAggregates";

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ParseStatus = "pending" | "uploading" | "done" | "error" | "no-match" | "parse-error";

interface ParsedFile {
  file: File;
  parsed: { year: number; month: number; half: 1 | 2 } | null;
  matchedRow: PayslipRow | null;
  status: ParseStatus;
  error?: string;
}

/**
 * Parses filenames like "Dec 14, 2024.pdf" → { year: 2024, month: 12, half: 1 }
 * Day 1–15 → half 1, day 16–31 → half 2.
 */
function parsePdfFilename(
  filename: string,
): { year: number; month: number; half: 1 | 2 } | null {
  const stem = filename.replace(/\.pdf$/i, "").trim();
  const m = stem.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (!m) return null;
  const [, monthStr, dayStr, yearStr] = m;
  const month = MONTH_MAP[monthStr.toLowerCase()];
  if (!month) return null;
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);
  if (day < 1 || day > 31 || year < 1900 || year > 2200) return null;
  return { year, month, half: day <= 15 ? 1 : 2 };
}

function periodLabel(p: { year: number; month: number; half: 1 | 2 }) {
  return `${MONTH_NAMES[p.month] ?? "?"} ${p.year} · ${p.half === 1 ? "1st half" : "2nd half"}`;
}

function resolveFileList(
  files: File[],
  rows: PayslipRow[],
): ParsedFile[] {
  return files.map((file) => {
    const parsed = parsePdfFilename(file.name);
    if (!parsed) {
      return { file, parsed: null, matchedRow: null, status: "parse-error" };
    }
    const slot = rowsForSlot(rows, parsed.year, parsed.month, parsed.half);
    const matchedRow = slot[0] ?? null;
    return {
      file,
      parsed,
      matchedRow,
      status: matchedRow ? "pending" : "no-match",
    };
  });
}

export function PdfBulkUploadClient() {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    getPayslips(2000)
      .then((r) => setRows(r.payslips))
      .catch((e) =>
        setLoadErr(e instanceof Error ? e.message : "Failed to load payslips"),
      );
  }, []);

  // Re-resolve matches when rows finish loading.
  useEffect(() => {
    if (rows.length > 0) {
      setItems((prev) =>
        prev.length > 0
          ? resolveFileList(
              prev.map((i) => i.file),
              rows,
            )
          : prev,
      );
    }
  }, [rows]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const pdfs = Array.from(incoming).filter((f) =>
        f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfs.length === 0) return;
      setItems((prev) => {
        const existingNames = new Set(prev.map((i) => i.file.name));
        const fresh = pdfs.filter((f) => !existingNames.has(f.name));
        if (fresh.length === 0) return prev;
        return [...prev, ...resolveFileList(fresh, rowsRef.current)];
      });
    },
    [],
  );

  const uploadOne = useCallback(async (idx: number) => {
    const item = itemsRef.current[idx];
    if (!item?.matchedRow) return;
    setItems((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, status: "uploading", error: undefined };
      return next;
    });
    try {
      await uploadPayslipPdf(item.matchedRow.id, item.file);
      setItems((prev) => {
        const next = [...prev];
        const cur = next[idx];
        if (!cur) return prev;
        next[idx] = { ...cur, status: "done" };
        return next;
      });
    } catch (e) {
      setItems((prev) => {
        const next = [...prev];
        const cur = next[idx];
        if (!cur) return prev;
        next[idx] = {
          ...cur,
          status: "error",
          error: e instanceof Error ? e.message : "Upload failed",
        };
        return next;
      });
    }
  }, []);

  const uploadAll = async () => {
    setUploading(true);
    const indices = itemsRef.current
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.status === "pending" && item.matchedRow)
      .map(({ i }) => i);
    for (const idx of indices) {
      await uploadOne(idx);
    }
    setUploading(false);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearAll = () => setItems([]);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">

      {loadErr && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {loadErr}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging
            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/30"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
        ].join(" ")}
      >
        <UploadIcon className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Drop PDF files here or click to select
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Multiple files supported · PDF only
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* File list */}
      {items.length > 0 && (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {items.length} file{items.length !== 1 ? "s" : ""}
              {pendingCount > 0 && (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400">
                  · {pendingCount} ready to upload
                </span>
              )}
              {doneCount > 0 && (
                <span className="ml-2 text-green-600 dark:text-green-400">
                  · {doneCount} uploaded
                </span>
              )}
              {errorCount > 0 && (
                <span className="ml-2 text-red-600 dark:text-red-400">
                  · {errorCount} failed
                </span>
              )}
            </p>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void uploadAll()}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : `Upload all (${pendingCount})`}
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                disabled={uploading}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Clear all
              </button>
            </div>
          </div>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item, idx) => (
              <FileRow
                key={item.file.name + idx}
                item={item}
                onUpload={() => void uploadOne(idx)}
                onRemove={() => removeItem(idx)}
                uploading={uploading}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FileRow({
  item,
  onUpload,
  onRemove,
  uploading,
}: {
  item: ParsedFile;
  onUpload: () => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  const { file, parsed, status, error } = item;

  const statusBadge = () => {
    switch (status) {
      case "pending":
        return (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Ready
          </span>
        );
      case "uploading":
        return (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            Uploading…
          </span>
        );
      case "done":
        return (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950/60 dark:text-green-300">
            Uploaded
          </span>
        );
      case "error":
        return (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-300">
            Error
          </span>
        );
      case "no-match":
        return (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            No payslip record
          </span>
        );
      case "parse-error":
        return (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-300">
            Unrecognized filename
          </span>
        );
    }
  };

  const dimmed = status === "no-match" || status === "parse-error";

  return (
    <li className={`flex flex-wrap items-start gap-3 px-5 py-3 ${dimmed ? "opacity-60" : ""}`}>
      <PdfIcon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {file.name}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {parsed
            ? periodLabel(parsed)
            : status === "parse-error"
              ? "Could not parse date from filename"
              : "—"}
        </p>
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {statusBadge()}
        {status === "pending" && (
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            Upload
          </button>
        )}
        {(status === "error" || status === "pending") && (
          <button
            type="button"
            onClick={onRemove}
            disabled={uploading}
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        )}
        {(status === "no-match" || status === "parse-error" || status === "done") && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h1c.6 0 1 .4 1 1v1c0 .6-.4 1-1 1H9v-3z" />
      <path d="M13 13h1.5a1.5 1.5 0 0 1 0 3H13v-3z" />
      <path d="M17 13v3" />
    </svg>
  );
}
