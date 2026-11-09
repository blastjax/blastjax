# Node web:components:AmountInput: components/AmountInput.tsx
Kind: module
Language: typescript, 78 lines of code, location: web/src/components/AmountInput.tsx

Source excerpt: web/src/components/AmountInput.tsx (first 87 lines)
```
   1  "use client";
   2  
   3  import { useRef, type InputHTMLAttributes } from "react";
   4  import { evaluateAmountExpression, formatAmountOnBlur } from "@/lib/parseFormNumber";
   5  import { INPUT_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";
   6  
   7  export type AmountInputProps = Omit<
   8    InputHTMLAttributes<HTMLInputElement>,
   9    "type" | "inputMode" | "value" | "onChange" | "onBlur"
  10  > & {
  11    value: string;
  12    onChange: (raw: string) => void;
  13    mode?: "amount" | "expression";
  14  };
  15  
  16  const OPERATORS = [
  17    { key: "+", label: "+", name: "Plus" },
  18    { key: "-", label: "−", name: "Minus" },
  19    { key: "×", label: "×", name: "Times" },
  20    { key: "÷", label: "÷", name: "Divided by" },
  21  ] as const;
  22  
  23  const RE_TRAILING_OPERATOR = /[-+*/×÷]\s*$/;
  24  
  25  export function AmountInput({
  26    value,
  27    onChange,
  28    mode = "amount",
  29    className = "",
  30    ...rest
  31  }: AmountInputProps) {
  32    const inputRef = useRef<HTMLInputElement>(null);
  33    const calculator = mode === "expression";
  34    // Running total while a sum is typed, e.g. "120+45×2" shows "= 210.00".
  35    const total = calculator && /[-+*/×÷]/.test(value.trim().slice(1)) ? evaluateAmountExpression(value) : null;
  36  
  37    const input = (
  38      <input
  39        {...rest}
  40        ref={inputRef}
  41        type="text"
  42        inputMode="decimal"
  43        className={`${INPUT_CLASSES} ${total != null ? "w-full pr-28" : ""} ${className}`.trim()}
  44        value={value}
  45        onChange={(e) => onChange(e.target.value)}
  46        onBlur={(e) => {
  47          const next = calculator ? evaluateAmountExpression(e.target.value) : formatAmountOnBlur(e.target.value);
  48          if (next != null) onChange(next);
  49        }}
  50      />
  51    );
  52    if (!calculator) return input;
  53  
  54    const press = (op: string) => {
  55      const base = value.trim().replace(RE_TRAILING_OPERATOR, "");
  56      if (base) onChange(base + op);
  57      inputRef.current?.focus();
  58    };
  59  
  60    return (
  61      <div className="flex flex-col gap-2">
  62        <div className="relative flex flex-col">
  63          {input}
  64          {total != null && (
  65            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium tabular-nums text-ink-3">
  66              = {total}
  67            </span>
  68          )}
  69        </div>
  70        <div className="grid grid-cols-4 gap-2">
  71          {OPERATORS.map((op) => (
  72            <button
  73              key={op.key}
  74              type="button"
  75              aria-label={op.name}
  76              disabled={rest.disabled}
  77              onMouseDown={(e) => e.preventDefault()}
  78              onClick={() => press(op.key)}
  79              className={`${SECONDARY_BUTTON_CLASSES} text-base`}
  80            >
  81              {op.label}
  82            </button>
  83          ))}
  84        </div>
  85      </div>
  86    );
  87  }
```

## Outgoing connections
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /bills (web:bills) -> call
- /calendar (web:calendar) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
