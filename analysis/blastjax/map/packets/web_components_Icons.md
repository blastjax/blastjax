# Node web:components:Icons: components/Icons.tsx
Kind: module
Language: typescript, 302 lines of code, location: web/src/components/Icons.tsx

Source excerpt: web/src/components/Icons.tsx (first 150 lines)
```
   1  export type IconProps = {
   2    className?: string;
   3  };
   4  
   5  function Svg({
   6    className = "size-5",
   7    children,
   8  }: IconProps & { children: React.ReactNode }) {
   9    return (
  10      <svg
  11        viewBox="0 0 24 24"
  12        fill="none"
  13        stroke="currentColor"
  14        strokeWidth={1.5}
  15        strokeLinecap="round"
  16        strokeLinejoin="round"
  17        className={className}
  18        aria-hidden="true"
  19        focusable="false"
  20      >
  21        {children}
  22      </svg>
  23    );
  24  }
  25  
  26  export function CalendarIcon(p: IconProps) {
  27    return (
  28      <Svg {...p}>
  29        <rect x="3" y="5" width="18" height="16" rx="3" />
  30        <path d="M3 10h18M8 3v4M16 3v4" />
  31        <path d="M8 15h.01M12 15h.01M16 15h.01" />
  32      </Svg>
  33    );
  34  }
  35  
  36  export function WalletIcon(p: IconProps) {
  37    return (
  38      <Svg {...p}>
  39        <path d="M3 8a3 3 0 0 1 3-3h11a2 2 0 0 1 2 2v1" />
  40        <rect x="3" y="7" width="18" height="13" rx="3" />
  41        <path d="M16 13.5h2.5" />
  42      </Svg>
  43    );
  44  }
  45  
  46  export function CreditCardIcon(p: IconProps) {
  47    return (
  48      <Svg {...p}>
  49        <rect x="2.5" y="5" width="19" height="14" rx="3" />
  50        <path d="M2.5 10h19M6.5 15h3" />
  51      </Svg>
  52    );
  53  }
  54  
  55  export function LayersIcon(p: IconProps) {
  56    return (
  57      <Svg {...p}>
  58        <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
  59        <path d="m3 12.5 9 4.5 9-4.5M3 17l9 4.5L21 17" />
  60      </Svg>
  61    );
  62  }
  63  
  64  export function HomeIcon(p: IconProps) {
  65    return (
  66      <Svg {...p}>
  67        <path d="M3.5 10.5 12 4l8.5 6.5V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8.5Z" />
  68        <path d="M9.5 21v-6h5v6" />
  69      </Svg>
  70    );
  71  }
  72  
  73  export function DocumentIcon(p: IconProps) {
  74    return (
  75      <Svg {...p}>
  76        <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
  77        <path d="M13 3v5h5M8.5 13h7M8.5 17h4" />
  78      </Svg>
  79    );
  80  }
  81  
  82  export function ReceiptIcon(p: IconProps) {
  83    return (
  84      <Svg {...p}>
  85        <path d="M7 3h10a2 2 0 0 1 2 2v16l-2.33-1.5-2.34 1.5-2.33-1.5-2.33 1.5-2.34-1.5L5 21V5a2 2 0 0 1 2-2Z" />
  86        <path d="M9 8h6M9 12h6M9 16h3" />
  87      </Svg>
  88    );
  89  }
  90  
  91  export function TrendingUpIcon(p: IconProps) {
  92    return (
  93      <Svg {...p}>
  94        <path d="m3 16 5.5-5.5 3.5 3.5L21 5" />
  95        <path d="M15.5 5H21v5.5" />
  96        <path d="M3 21h18" />
  97      </Svg>
  98    );
  99  }
 100  
 101  export function ChartBarIcon(p: IconProps) {
 102    return (
 103      <Svg {...p}>
 104        <path d="M3 21h18" />
 105        <rect x="4.5" y="11" width="4" height="7" rx="1" />
 106        <rect x="10" y="6.5" width="4" height="11.5" rx="1" />
 107        <rect x="15.5" y="14" width="4" height="4" rx="1" />
 108      </Svg>
 109    );
 110  }
 111  
 112  export function HeartPulseIcon(p: IconProps) {
 113    return (
 114      <Svg {...p}>
 115        <path d="M20.4 6.6a4.6 4.6 0 0 0-7.5-1.4L12 6.1l-.9-.9a4.6 4.6 0 0 0-7.5 5.1" />
 116        <path d="M3.2 13h3.3l1.6-2.7L10.4 16l2.2-4.4 1.2 1.4h7" />
 117        <path d="M20.6 13.2c-1.4 2.6-5 5.6-8.6 8.3-1.4-1-3-2.3-4.5-3.6" />
 118      </Svg>
 119    );
 120  }
 121  
 122  export function PlaneIcon(p: IconProps) {
 123    return (
 124      <Svg {...p}>
 125        <path d="M10.5 3.2a1.5 1.5 0 0 1 3 0V9l7.5 4.4v2.3l-7.5-2.3v3.9l2.5 1.9v1.6L12 20l-4 .8v-1.6l2.5-1.9v-3.9L3 15.7v-2.3L10.5 9V3.2Z" />
 126      </Svg>
 127    );
 128  }
 129  
 130  export function GridIcon(p: IconProps) {
 131    return (
 132      <Svg {...p}>
 133        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
 134        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
 135        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
 136        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
 137      </Svg>
 138    );
 139  }
 140  
 141  export function MusicIcon(p: IconProps) {
 142    return (
 143      <Svg {...p}>
 144        <path d="M9 18V5l11-2v13" />
 145        <circle cx="6.5" cy="18" r="2.5" />
 146        <circle cx="17.5" cy="16" r="2.5" />
 147      </Svg>
 148    );
 149  }
 150  
```

## Outgoing connections
- none

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/CalendarMonth.tsx (web:components:CalendarMonth) -> call
- components/ErrorAlert.tsx (web:components:ErrorAlert) -> call
- components/FinanceUI.tsx (web:components:FinanceUI) -> call
- components/Header.tsx (web:components:Header) -> call
- components/PageHeader.tsx (web:components:PageHeader) -> call
- components/PickerField.tsx (web:components:PickerField) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- components/StatsPage.tsx (web:components:StatsPage) -> call
- components/YearMonthGrid.tsx (web:components:YearMonthGrid) -> call
- /credit-card (web:credit-card) -> call
- Home page (web:home) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- lib/nav.ts (web:lib:nav) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
- /software-architecture (web:software-architecture) -> call
