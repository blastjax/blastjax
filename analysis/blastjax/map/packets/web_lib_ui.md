# Node web:lib:ui: lib/ui.ts
Kind: module
Language: typescript, 62 lines of code, location: web/src/lib/ui.ts

Source excerpt: web/src/lib/ui.ts (first 88 lines)
```
   1  export const PAGE_CONTAINER_CLASSES =
   2    "relative mx-auto flex w-full min-w-0 max-w-[1536px] flex-col gap-6 px-4 pb-28 pt-6 sm:gap-7 sm:px-6 sm:pb-10 xl:px-8";
   3  
   4  // Same look as FinanceUI's <Panel>, for cards that can't be one (links, buttons).
   5  export const CARD_CLASSES =
   6    "rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6";
   7  
   8  export const SECTION_LABEL_CLASSES =
   9    "text-xs font-medium uppercase tracking-wider text-ink-4";
  10  
  11  export const DASHED_EMPTY_CLASSES =
  12    "rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-3";
  13  
  14  export function alertClasses(
  15    tone: "error" | "warning" | "success" | "info" = "error",
  16  ): string {
  17    const base = "rounded-lg border px-4 py-3 text-sm";
  18    switch (tone) {
  19      case "success":
  20        return `${base} border-success-line bg-success-soft text-success-text`;
  21      case "warning":
  22        return `${base} border-warning-line bg-warning-soft text-warning-text`;
  23      case "info":
  24        return `${base} border-info-line bg-info-soft text-info-text`;
  25      case "error":
  26      default:
  27        return `${base} border-danger-line bg-danger-soft text-danger-text`;
  28    }
  29  }
  30  
  31  export const ERROR_ALERT_CLASSES = alertClasses("error");
  32  
  33  const BUTTON_BASE =
  34    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";
  35  
  36  const BUTTON_MD = `${BUTTON_BASE} h-10 px-4 text-sm`;
  37  const BUTTON_SM = `${BUTTON_BASE} h-8 px-3 text-xs`;
  38  
  39  const FILL_BRAND = "bg-brand text-brand-on shadow-xs hover:bg-brand-hover";
  40  const OUTLINE_NEUTRAL =
  41    "border border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink";
  42  const SOFT_BRAND = "bg-brand-soft text-brand-text hover:bg-brand-soft-hover";
  43  const GHOST_NEUTRAL = "text-ink-3 hover:bg-surface-2 hover:text-ink";
  44  const OUTLINE_DANGER =
  45    "border border-danger/40 bg-danger-soft text-danger-text hover:border-danger/70";
  46  const FILL_DANGER = "bg-danger text-white shadow-xs hover:bg-danger/90";
  47  
  48  export const PRIMARY_BUTTON_CLASSES = `${BUTTON_MD} ${FILL_BRAND}`;
  49  
  50  export const SECONDARY_BUTTON_CLASSES = `${BUTTON_MD} ${OUTLINE_NEUTRAL}`;
  51  
  52  export const ACTION_BUTTON_CLASSES = `${BUTTON_MD} ${SOFT_BRAND}`;
  53  
  54  export const ADD_BUTTON_CLASSES = `${BUTTON_SM} ${FILL_BRAND}`;
  55  
  56  export const EDIT_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_NEUTRAL}`;
  57  
  58  export const DELETE_BUTTON_CLASSES = `${BUTTON_SM} ${OUTLINE_DANGER}`;
  59  
  60  export const DANGER_BUTTON_CLASSES = `${BUTTON_MD} ${FILL_DANGER}`;
  61  
  62  export const DETAIL_BUTTON_CLASSES = `${BUTTON_SM} ${GHOST_NEUTRAL}`;
  63  
  64  export const ICON_BUTTON_CLASSES =
  65    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:invisible";
  66  
  67  export const TOGGLE_ACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${FILL_BRAND}`;
  68  export const TOGGLE_INACTIVE_BUTTON_CLASSES = `${BUTTON_BASE} h-9 px-4 text-sm ${OUTLINE_NEUTRAL}`;
  69  
  70  export const INPUT_CLASSES =
  71    "rounded-lg border border-input-line bg-input-bg px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:opacity-60";
  72  
  73  export const LABEL_CLASSES = "mb-1.5 block text-sm font-medium text-ink-2";
  74  
  75  export const CHART_ZOOM_BUTTON_CLASSES =
  76    "flex h-7 min-w-7 select-none items-center justify-center rounded-md border border-line-strong bg-surface text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";
  77  
  78  // Tables sit flush in a <Panel flush>: the outer cells pad out to line up with the panel's edges.
  79  // Rows carry the text color and size so a cell can override them without a class conflict.
  80  // Head cells need their own text-left / text-right, since browsers center <th>.
  81  const TABLE_EDGE_PADDING = "first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6";
  82  export const TABLE_HEAD_ROW_CLASSES = "border-y border-line-soft text-xs text-ink-3";
  83  export const TABLE_HEAD_CELL_CLASSES = `px-3 py-2.5 font-medium ${TABLE_EDGE_PADDING}`;
  84  export const TABLE_ROW_CLASSES =
  85    "border-b border-line-soft text-sm tabular-nums text-ink-2 last:border-0 transition-colors duration-150 hover:bg-surface-2/50";
  86  export const TABLE_CELL_CLASSES = `px-3 py-3 ${TABLE_EDGE_PADDING}`;
  87  export const FILE_INPUT_CLASSES =
  88    "block w-full text-sm text-ink-3 file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink-2 hover:file:bg-surface-2 disabled:opacity-60";
```

## Outgoing connections
- none

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- components/AmountInput.tsx (web:components:AmountInput) -> call
- components/AuthGate.tsx (web:components:AuthGate) -> call
- components/CalendarMonth.tsx (web:components:CalendarMonth) -> call
- components/ChartZoomControls.tsx (web:components:ChartZoomControls) -> call
- components/CompanyRedirect.tsx (web:components:CompanyRedirect) -> call
- components/ConfirmDialog.tsx (web:components:ConfirmDialog) -> call
- components/DateRangePickerField.tsx (web:components:DateRangePickerField) -> call
- components/ErrorAlert.tsx (web:components:ErrorAlert) -> call
- components/FinanceUI.tsx (web:components:FinanceUI) -> call
- components/Header.tsx (web:components:Header) -> call
- components/PickerField.tsx (web:components:PickerField) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- /credit-card (web:credit-card) -> call
- /games/mambo (web:games/mambo) -> call
- /games/mastermind (web:games/mastermind) -> call
- /games/mosaic (web:games/mosaic) -> call
- /games/sets (web:games/sets) -> call
- Home page (web:home) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- layout + error (web:layout) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /settings (web:settings) -> call
- /software-architecture (web:software-architecture) -> call
