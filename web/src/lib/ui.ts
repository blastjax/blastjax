export const PAGE_CONTAINER_CLASSES =
  "relative mx-auto flex w-full min-w-0 max-w-[1536px] flex-col gap-6 px-4 pb-28 pt-6 sm:gap-7 sm:px-6 sm:pb-10 xl:px-8";

export const CARD_CLASSES =
  "rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6";

export const SECTION_LABEL_CLASSES =
  "text-xs font-medium uppercase tracking-wider text-ink-4";

export const DASHED_EMPTY_CLASSES =
  "rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3";

export const MODAL_DIALOG_CLASSES =
  "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop sm:p-6";

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

export const LOADING_TEXT_CLASSES = "text-sm text-ink-3";

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

export const PRIMARY_BUTTON_CLASSES = `${BUTTON_MD} ${FILL_BRAND}`;

export const SECONDARY_BUTTON_CLASSES = `${BUTTON_MD} ${OUTLINE_NEUTRAL}`;

export const ACTION_BUTTON_CLASSES = `${BUTTON_MD} ${SOFT_BRAND}`;

export const ADD_BUTTON_CLASSES = `${BUTTON_SM} ${FILL_BRAND}`;

export const EDIT_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_NEUTRAL}`;

export const DELETE_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_DANGER}`;

export const DETAIL_BUTTON_CLASSES = `${BUTTON_SM} ${GHOST_NEUTRAL}`;

export const CLOSE_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_NEUTRAL}`;

export const ICON_BUTTON_CLASSES =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:invisible";

export const TOGGLE_ACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${FILL_BRAND}`;
export const TOGGLE_INACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${OUTLINE_NEUTRAL}`;

export const INPUT_CLASSES =
  "rounded-lg border border-input-line bg-input-bg px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:opacity-60";

export const LABEL_CLASSES = "mb-1.5 block text-sm font-medium text-ink-2";

export const SEGMENTED_WRAPPER_CLASSES =
  "inline-flex rounded-lg border border-line bg-surface-2 p-1";
export const SEGMENTED_BUTTON_CLASSES =
  "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150";
export const SEGMENTED_BUTTON_ACTIVE_CLASSES =
  "bg-brand text-brand-on shadow-xs";
export const SEGMENTED_BUTTON_INACTIVE_CLASSES =
  "text-ink-3 hover:text-ink";

export const CHART_ZOOM_BUTTON_CLASSES =
  "flex h-7 min-w-7 select-none items-center justify-center rounded-md border border-line-strong bg-surface text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

export const TABLE_WRAPPER_CLASSES =
  "overflow-hidden rounded-xl border border-line bg-surface";
export const TABLE_HEAD_ROW_CLASSES = "border-b border-line bg-surface-2/50";
export const TABLE_HEAD_CELL_CLASSES =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-ink-3";
export const TABLE_ROW_CLASSES =
  "border-b border-line-soft last:border-0 transition-colors duration-150 hover:bg-surface-2/50";
export const TABLE_CELL_CLASSES = "px-4 py-3 text-sm text-ink-2 tabular-nums";

export const AMOUNT_POSITIVE_CLASSES =
  "font-medium tabular-nums text-success-text";
export const AMOUNT_NEGATIVE_CLASSES =
  "font-medium tabular-nums text-danger-text";
