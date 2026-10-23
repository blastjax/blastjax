export const PAGE_CONTAINER_CLASSES =
  "relative mx-auto flex w-full min-w-0 max-w-[1536px] flex-col gap-6 px-4 pb-28 pt-6 sm:gap-7 sm:px-6 sm:pb-10 xl:px-8";

// Same look as FinanceUI's <Panel>, for cards that can't be one (links, buttons).
export const CARD_CLASSES =
  "rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6";

export const SECTION_LABEL_CLASSES =
  "text-xs font-medium uppercase tracking-wider text-ink-4";

export const DASHED_EMPTY_CLASSES =
  "rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3";

export function alertClasses(
  tone: "error" | "warning" | "success" | "info" = "error",
): string {
  const base = "rounded-lg border px-4 py-3 text-sm";
  switch (tone) {
    case "success":
      return `${base} border-success-line bg-success-soft text-success-text`;
    case "warning":
      return `${base} border-warning-line bg-warning-soft text-warning-text`;
    case "info":
      return `${base} border-info-line bg-info-soft text-info-text`;
    case "error":
    default:
      return `${base} border-danger-line bg-danger-soft text-danger-text`;
  }
}

export const ERROR_ALERT_CLASSES = alertClasses("error");

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

const BUTTON_MD = `${BUTTON_BASE} h-10 px-4 text-sm`;
const BUTTON_SM = `${BUTTON_BASE} h-8 px-3 text-xs`;

const FILL_BRAND = "bg-brand text-brand-on shadow-xs hover:bg-brand-hover";
const OUTLINE_NEUTRAL =
  "border border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink";
const SOFT_BRAND = "bg-brand-soft text-brand-text hover:bg-brand-soft-hover";
const GHOST_NEUTRAL = "text-ink-3 hover:bg-surface-2 hover:text-ink";
const OUTLINE_DANGER =
  "border border-danger/40 bg-danger-soft text-danger-text hover:border-danger/70";
const FILL_DANGER = "bg-danger text-white shadow-xs hover:bg-danger/90";

export const PRIMARY_BUTTON_CLASSES = `${BUTTON_MD} ${FILL_BRAND}`;

export const SECONDARY_BUTTON_CLASSES = `${BUTTON_MD} ${OUTLINE_NEUTRAL}`;

export const ACTION_BUTTON_CLASSES = `${BUTTON_MD} ${SOFT_BRAND}`;

export const ADD_BUTTON_CLASSES = `${BUTTON_SM} ${FILL_BRAND}`;

export const EDIT_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_NEUTRAL}`;

export const DELETE_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_DANGER}`;

export const DANGER_BUTTON_CLASSES = `${BUTTON_MD} ${FILL_DANGER}`;

export const DETAIL_BUTTON_CLASSES = `${BUTTON_SM} ${GHOST_NEUTRAL}`;

export const ICON_BUTTON_CLASSES =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:invisible";

export const TOGGLE_ACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${FILL_BRAND}`;
export const TOGGLE_INACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${OUTLINE_NEUTRAL}`;

export const INPUT_CLASSES =
  "rounded-lg border border-input-line bg-input-bg px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:opacity-60";

export const LABEL_CLASSES = "mb-1.5 block text-sm font-medium text-ink-2";

export const CHART_ZOOM_BUTTON_CLASSES =
  "flex h-7 min-w-7 select-none items-center justify-center rounded-md border border-line-strong bg-surface text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

// Tables sit flush in a <Panel flush>: the outer cells pad out to line up with the panel's edges.
// Rows carry the text color and size so a cell can override them without a class conflict.
// Head cells need their own text-left / text-right, since browsers center <th>.
const TABLE_EDGE_PADDING = "first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6";
export const TABLE_HEAD_ROW_CLASSES = "border-y border-line-soft text-xs text-ink-3";
export const TABLE_HEAD_CELL_CLASSES = `px-3 py-2.5 font-medium ${TABLE_EDGE_PADDING}`;
export const TABLE_ROW_CLASSES =
  "border-b border-line-soft text-sm tabular-nums text-ink-2 last:border-0 transition-colors duration-150 hover:bg-surface-2/50";
export const TABLE_CELL_CLASSES = `px-3 py-3 ${TABLE_EDGE_PADDING}`;
