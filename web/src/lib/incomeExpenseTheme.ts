/**
 * Shared Tailwind classes for income vs expense money (expense stays rose).
 */

/** Budget cards, calendar totals, day cell income amounts */
export const incomeHeadlineTextClass =
  "text-blue-600 dark:text-blue-400";

/** Data preview and table cells for income-type transactions */
export const incomeFlowTextClass =
  "text-blue-700 dark:text-blue-400";

/** Selected "Income" type in add/edit transaction modal */
export const txModalIncomeSelectedClass =
  "border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-500 dark:bg-blue-600";

/** "Show" chip for categories hidden from the income pie */
export const hiddenIncomePieCategoryChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100 dark:hover:bg-blue-900/60";

export const hiddenIncomePieCategoryChipAccentClass =
  "shrink-0 text-blue-700 dark:text-blue-300";

/** Same pattern for expense pie hidden categories (rose, not income blue) */
export const hiddenExpensePieCategoryChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100 dark:hover:bg-rose-900/60";

export const hiddenExpensePieCategoryChipAccentClass =
  "shrink-0 text-rose-700 dark:text-rose-300";
