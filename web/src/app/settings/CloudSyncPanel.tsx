"use client";

import { useState } from "react";
import { syncToCloud } from "@/lib/api";

type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; at: string; direction: "push" | "pull" | undefined }
  | { kind: "error"; message: string };

export function CloudSyncPanel() {
  const [state, setState] = useState<SyncState>({ kind: "idle" });

  const onSync = async () => {
    setState({ kind: "syncing" });
    try {
      const result = await syncToCloud();
      setState({
        kind: "done",
        at: new Date().toLocaleTimeString(),
        direction: result.direction,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Sync failed",
      });
    }
  };

  const doneLabel = (direction: "push" | "pull" | undefined, at: string) => {
    if (direction === "pull") return `Pulled from cloud at ${at}.`;
    if (direction === "push") return `Pushed to cloud at ${at}.`;
    return `Synced at ${at}.`;
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        Cloud sync
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Syncs local and cloud databases. Whichever has the most recent entry
        wins — if the cloud is newer it pulls down to local, otherwise local is
        pushed up to the cloud.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onSync()}
          disabled={state.kind === "syncing"}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {state.kind === "syncing" ? "Syncing…" : "Sync"}
        </button>
        {state.kind === "done" && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            {doneLabel(state.direction, state.at)}
          </span>
        )}
        {state.kind === "error" && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </span>
        )}
      </div>
    </section>
  );
}
