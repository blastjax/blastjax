/**
 * Shared Tailwind classes for forms, modals, and buttons across the app.
 */

/** Label above inputs (use inside a flex flex-col gap-1 wrapper). */
export const fieldLabelText =
  "text-xs font-medium text-zinc-600 dark:text-zinc-400";

/** Standard text input / select appearance + focus ring. */
export const inputClass =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-indigo-500";

/** Same as input but without forced w-full (for grids). */
export const inputClassNoFullWidth =
  "min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-indigo-500";

/** Field that opens a picker (matches transaction modal triggers). */
export const fieldTriggerButton =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-800 shadow-sm transition hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-indigo-500";

export const modalBackdrop =
  "fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-4";

/** Backdrop with lighter scrim; bottom-aligned on small screens (add-category pattern). */
export const modalBackdropMobileSheet =
  "fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:bg-black/50 sm:p-6";

export const modalBackdropHigh =
  "fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-4";

export const modalPanel =
  "max-h-[min(90dvh,90vh)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:p-6 dark:border-zinc-700 dark:bg-zinc-950";

export const modalTitle =
  "text-lg font-semibold text-zinc-900 dark:text-zinc-50";

export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950";

export const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:ring-offset-zinc-950";

export const btnDangerOutline =
  "inline-flex items-center justify-center rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 dark:focus-visible:ring-offset-zinc-950";

/** Compact destructive (lists, toolbars). */
export const btnSmallDangerOutline =
  "inline-flex items-center justify-center rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-800 shadow-sm transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-900 dark:text-red-200 dark:hover:bg-red-950/40";

export const btnGhost =
  "rounded-lg px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-zinc-800";

/** Small solid actions (Categories row, etc.). */
export const btnSmallPrimary =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50";

export const btnSmallSecondary =
  "inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

export const pickerOptionNone =
  "rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 shadow-sm transition hover:border-indigo-300 hover:bg-white dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-500";

export const pickerOption =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-800 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40";

/** Bordered content blocks (search, upload, tables shell). */
export const sectionCard =
  "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

/** Compact primary (toolbar / banners). */
export const btnCompactPrimary =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50";

export const btnCompactEmerald =
  "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50";

export const btnCompactIndigoOutline =
  "inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 shadow-sm transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-600 dark:bg-transparent dark:text-indigo-100 dark:hover:bg-indigo-900/60";

/** Unselected in-month day cells on calendar month / mini grids. */
export const calendarDayHover =
  "transition-[background-color,box-shadow] duration-150 hover:bg-indigo-50 hover:shadow-md hover:ring-1 hover:ring-indigo-200/80 dark:hover:bg-indigo-950/45 dark:hover:ring-indigo-600/50";

/** Spill (adjacent-month) day cells on calendar grids. */
export const calendarDayHoverSpill =
  "transition-[background-color,box-shadow,opacity] duration-150 hover:bg-indigo-50/90 hover:opacity-100 hover:shadow-sm hover:ring-1 hover:ring-indigo-200/70 dark:hover:bg-indigo-950/40 dark:hover:opacity-100 dark:hover:ring-indigo-600/45";

/** Year overview month cards that wrap a mini calendar. */
export const calendarYearMonthCardHover =
  "transition-[border-color,box-shadow,background-color] duration-150 hover:border-indigo-300 hover:bg-indigo-50/70 hover:shadow-md dark:hover:border-indigo-600 dark:hover:bg-indigo-950/35";

/** Data preview, drill modals, grouped tx rows — interactive (click opens edit / drill). */
export const interactiveHoverSurface =
  "transition-colors duration-150 hover:bg-indigo-50 hover:shadow-sm dark:hover:bg-indigo-950/40";

/** Same table/list context when the row is not clickable — still underline hover target. */
export const readonlyHoverSurface =
  "transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800/55";

/** Sidebar main nav links when the route is not active. */
export const sidebarNavInactiveHover =
  "hover:bg-indigo-50 hover:text-indigo-950 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-50";

/** Account balance list row (full-width control inside the card). */
export const accountBalanceRowHover =
  "transition-colors duration-150 hover:bg-indigo-50/95 dark:hover:bg-indigo-950/35";

/** Native file input: style the button part consistently. */
export const fileInputClass =
  "text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-300 dark:file:bg-zinc-700 dark:file:text-zinc-100 dark:hover:file:bg-zinc-600";
