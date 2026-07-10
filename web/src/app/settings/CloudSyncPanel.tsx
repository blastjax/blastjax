"use client";

import { useEffect, useState } from "react";
import { syncPushToCloud, syncPullFromCloud, getLatestTransactionTime } from "@/lib/api";

type ActionState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; at: string }
  | { kind: "error"; message: string };

type TransactionInfo = {
  sync_enabled: boolean;
  local_ts: string | null;
  cloud_ts: string | null;
};

function timeAgo(isoTs: string): string {
  const diffMs = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function LatestTransactionLabel({ info }: { info: TransactionInfo | null | undefined }) {
  if (info === undefined) {
    return <span className="text-zinc-400 dark:text-zinc-500">Loading…</span>;
  }
  if (info === null) {
    return <span className="text-zinc-400 dark:text-zinc-500">Could not load transaction info.</span>;
  }

  const { sync_enabled, local_ts, cloud_ts } = info;

  // Single-DB mode (no local mirror configured)
  if (!sync_enabled) {
    if (!cloud_ts) return <span className="text-zinc-400 dark:text-zinc-500">No transactions found.</span>;
    return (
      <span>
        Latest transaction is <strong>{timeAgo(cloud_ts)}</strong>{" "}
        <span className="text-zinc-400 dark:text-zinc-500">(cloud)</span>
      </span>
    );
  }

  // Both DBs available — show which one is newer
  const localDate = local_ts ? new Date(local_ts) : null;
  const cloudDate = cloud_ts ? new Date(cloud_ts) : null;

  if (!localDate && !cloudDate) {
    return <span className="text-zinc-400 dark:text-zinc-500">No transactions found.</span>;
  }

  let newerSource: "local" | "cloud" | "same";
  let newerTs: string;

  if (!localDate) {
    newerSource = "cloud";
    newerTs = cloud_ts!;
  } else if (!cloudDate) {
    newerSource = "local";
    newerTs = local_ts!;
  } else if (cloudDate > localDate) {
    newerSource = "cloud";
    newerTs = cloud_ts!;
  } else if (localDate > cloudDate) {
    newerSource = "local";
    newerTs = local_ts!;
  } else {
    newerSource = "same";
    newerTs = local_ts!;
  }

  const sourceLabel =
    newerSource === "same"
      ? "local and cloud are in sync"
      : newerSource === "cloud"
        ? "cloud is ahead"
        : "local is ahead";

  return (
    <span>
      Latest transaction is <strong>{timeAgo(newerTs)}</strong>{" "}
      <span className="text-zinc-400 dark:text-zinc-500">({sourceLabel})</span>
    </span>
  );
}

export function CloudSyncPanel() {
  const [pushState, setPushState] = useState<ActionState>({ kind: "idle" });
  const [pullState, setPullState] = useState<ActionState>({ kind: "idle" });
  const [txInfo, setTxInfo] = useState<TransactionInfo | null | undefined>(undefined);

  const fetchTxInfo = () => {
    getLatestTransactionTime()
      .then((r) => setTxInfo(r))
      .catch(() => setTxInfo(null));
  };

  useEffect(() => {
    fetchTxInfo();
  }, []);

  const onPush = async () => {
    setPushState({ kind: "syncing" });
    try {
      await syncPushToCloud();
      setPushState({ kind: "done", at: new Date().toLocaleTimeString() });
      fetchTxInfo();
    } catch (e) {
      setPushState({
        kind: "error",
        message: e instanceof Error ? e.message : "Push failed",
      });
    }
  };

  const onPull = async () => {
    setPullState({ kind: "syncing" });
    try {
      await syncPullFromCloud();
      setPullState({ kind: "done", at: new Date().toLocaleTimeString() });
      fetchTxInfo();
    } catch (e) {
      setPullState({
        kind: "error",
        message: e instanceof Error ? e.message : "Pull failed",
      });
    }
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        Cloud sync
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Manually push or pull between local and cloud databases.{" "}
        <LatestTransactionLabel info={txInfo} />
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
        {/* Sync to Cloud */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onPush()}
            disabled={pushState.kind === "syncing" || pullState.kind === "syncing"}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {pushState.kind === "syncing" ? "Pushing…" : "Sync to Cloud"}
          </button>
          {pushState.kind === "done" && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Pushed to cloud at {pushState.at}.
            </span>
          )}
          {pushState.kind === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {pushState.message}
            </span>
          )}
        </div>

        {/* Sync from Cloud */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onPull()}
            disabled={pullState.kind === "syncing" || pushState.kind === "syncing"}
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            {pullState.kind === "syncing" ? "Pulling…" : "Sync from Cloud"}
          </button>
          {pullState.kind === "done" && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Pulled from cloud at {pullState.at}.
            </span>
          )}
          {pullState.kind === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {pullState.message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
