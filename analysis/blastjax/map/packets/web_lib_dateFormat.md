# Node web:lib:dateFormat: lib/dateFormat.ts
Kind: module
Language: typescript, 123 lines of code, location: web/src/lib/dateFormat.ts

Source excerpt: web/src/lib/dateFormat.ts (first 146 lines)
```
   1  const LOCALE = "en-US";
   2  
   3  const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
   4    year: "numeric",
   5    month: "short",
   6    day: "numeric",
   7  });
   8  
   9  const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  10    year: "numeric",
  11    month: "short",
  12    day: "numeric",
  13    hour: "2-digit",
  14    minute: "2-digit",
  15  });
  16  
  17  const MONTH_DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  18    month: "short",
  19    day: "numeric",
  20  });
  21  
  22  const WEEKDAY_MONTH_DAY_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  23    weekday: "short",
  24    month: "short",
  25    day: "numeric",
  26  });
  27  
  28  const LONG_DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  29    weekday: "long",
  30    month: "long",
  31    day: "numeric",
  32    year: "numeric",
  33  });
  34  
  35  export const MONTH_NAMES_FULL = [
  36    "January",
  37    "February",
  38    "March",
  39    "April",
  40    "May",
  41    "June",
  42    "July",
  43    "August",
  44    "September",
  45    "October",
  46    "November",
  47    "December",
  48  ] as const;
  49  
  50  export const MONTH_NAMES_SHORT = [
  51    "Jan",
  52    "Feb",
  53    "Mar",
  54    "Apr",
  55    "May",
  56    "Jun",
  57    "Jul",
  58    "Aug",
  59    "Sep",
  60    "Oct",
  61    "Nov",
  62    "Dec",
  63  ] as const;
  64  
  65  export function monthKey(year: number, month: number): string {
  66    return `${year}-${String(month).padStart(2, "0")}`;
  67  }
  68  
  69  export function parseMonthKey(key: string): { y: number; m: number } | null {
  70    const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  71    if (!m) return null;
  72    const y = Number(m[1]);
  73    const mo = Number(m[2]);
  74    if (mo < 1 || mo > 12) return null;
  75    return { y, m: mo };
  76  }
  77  
  78  export function formatMonthYear(year: number, month: number): string {
  79    if (month < 1 || month > 12) return String(year);
  80    return `${MONTH_NAMES_FULL[month - 1]} ${year}`;
  81  }
  82  
  83  export function formatMonthYearShort(year: number, month: number): string {
  84    if (month < 1 || month > 12) return String(year);
  85    return `${MONTH_NAMES_SHORT[month - 1]} ${year}`;
  86  }
  87  
  88  export function toIsoDateLocal(d: Date): string {
  89    const y = d.getFullYear();
  90    const m = String(d.getMonth() + 1).padStart(2, "0");
  91    const day = String(d.getDate()).padStart(2, "0");
  92    return `${y}-${m}-${day}`;
  93  }
  94  
  95  export function addMonths(year: number, month: number, delta: number): { y: number; m: number } {
  96    const total = year * 12 + (month - 1) + delta;
  97    return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
  98  }
  99  
 100  export function parseDateOnlyLocal(iso: string): Date | null {
 101    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
 102    if (!m) return null;
 103    const y = Number(m[1]);
 104    const mo = Number(m[2]);
 105    const d = Number(m[3]);
 106    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
 107    return new Date(y, mo - 1, d);
 108  }
 109  
 110  // A bare "2026-10-23" is a calendar day: `new Date` would read it as UTC midnight,
 111  // which is the previous day west of UTC. Timestamps go through `new Date` as usual.
 112  function parseLocal(iso: string | null | undefined): Date | null {
 113    if (!iso) return null;
 114    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return parseDateOnlyLocal(iso);
 115    const d = new Date(iso);
 116    return Number.isNaN(d.getTime()) ? parseDateOnlyLocal(iso) : d;
 117  }
 118  
 119  function formatWith(format: Intl.DateTimeFormat, iso: string | null | undefined): string {
 120    const d = parseLocal(iso);
 121    return d ? format.format(d) : "—";
 122  }
 123  
 124  /** Oct 23, 2026 */
 125  export function formatDate(iso: string | null | undefined): string {
 126    return formatWith(DATE_FORMAT, iso);
 127  }
 128  
 129  export function formatDateTime(iso: string | null | undefined): string {
 130    return formatWith(DATE_TIME_FORMAT, iso);
 131  }
 132  
 133  /** Oct 23 */
 134  export function formatMonthDayShort(iso: string | null | undefined): string {
 135    return formatWith(MONTH_DAY_FORMAT, iso);
 136  }
 137  
 138  /** Fri, Oct 23 */
 139  export function formatWeekdayMonthDay(iso: string | null | undefined): string {
 140    return formatWith(WEEKDAY_MONTH_DAY_FORMAT, iso);
 141  }
 142  
 143  /** Friday, October 23, 2026 */
 144  export function formatDateLong(iso: string | null | undefined): string {
 145    return formatWith(LONG_DATE_FORMAT, iso);
 146  }
```

## Outgoing connections
- none

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/CalendarMonth.tsx (web:components:CalendarMonth) -> call
- components/DatePickerField.tsx (web:components:DatePickerField) -> call
- components/DateRangePickerField.tsx (web:components:DateRangePickerField) -> call
- components/FinanceUI.tsx (web:components:FinanceUI) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- components/MonthPickerField.tsx (web:components:MonthPickerField) -> call
- components/StatsPage.tsx (web:components:StatsPage) -> call
- components/YearMonthGrid.tsx (web:components:YearMonthGrid) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- lib/payPeriods.ts (web:lib:payPeriods) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
- /settings (web:settings) -> call
- /travels (web:travels) -> call
