/**
 * Shared className strings for patterns that should be byte-identical across
 * every page instead of copy-pasted (and drifting) per file.
 */

export const CARD_CLASSES =
  "rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6";

export const DASHED_EMPTY_CLASSES =
  "rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200";

export const ERROR_ALERT_CLASSES =
  "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";

export const PRIMARY_BUTTON_CLASSES =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50";

export const SECONDARY_BUTTON_CLASSES =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800";

export const INPUT_CLASSES =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export const LOADING_TEXT_CLASSES = "text-sm text-zinc-600 dark:text-zinc-400";

/** Segmented-control (pill toggle) pieces: wrapper + button + active/inactive state. */
export const SEGMENTED_WRAPPER_CLASSES =
  "inline-flex rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5 dark:border-zinc-700 dark:bg-zinc-900/50";
export const SEGMENTED_BUTTON_CLASSES = "rounded-md px-3 py-1.5 text-sm font-medium transition";
export const SEGMENTED_BUTTON_ACTIVE_CLASSES = "bg-indigo-600 text-white shadow-sm";
export const SEGMENTED_BUTTON_INACTIVE_CLASSES =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800";
