"use client";

import { useRef, type InputHTMLAttributes } from "react";
import { evaluateAmountExpression, formatAmountOnBlur } from "@/lib/parseFormNumber";
import { INPUT_CLASSES, SECONDARY_BUTTON_CLASSES } from "@/lib/ui";

export type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "onChange" | "onBlur"
> & {
  value: string;
  onChange: (raw: string) => void;
  mode?: "amount" | "expression";
};

const OPERATORS = [
  { key: "+", label: "+", name: "Plus" },
  { key: "-", label: "−", name: "Minus" },
  { key: "×", label: "×", name: "Times" },
  { key: "÷", label: "÷", name: "Divided by" },
] as const;

const RE_TRAILING_OPERATOR = /[-+*/×÷]\s*$/;

export function AmountInput({
  value,
  onChange,
  mode = "amount",
  className = "",
  ...rest
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const calculator = mode === "expression";
  // Running total while a sum is typed, e.g. "120+45×2" shows "= 210.00".
  const total = calculator && /[-+*/×÷]/.test(value.trim().slice(1)) ? evaluateAmountExpression(value) : null;

  const input = (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      className={`${INPUT_CLASSES} ${total != null ? "w-full pr-28" : ""} ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const next = calculator ? evaluateAmountExpression(e.target.value) : formatAmountOnBlur(e.target.value);
        if (next != null) onChange(next);
      }}
    />
  );
  if (!calculator) return input;

  const press = (op: string) => {
    const base = value.trim().replace(RE_TRAILING_OPERATOR, "");
    if (base) onChange(base + op);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex flex-col">
        {input}
        {total != null && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-medium tabular-nums text-ink-3">
            = {total}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {OPERATORS.map((op) => (
          <button
            key={op.key}
            type="button"
            aria-label={op.name}
            disabled={rest.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => press(op.key)}
            className={`${SECONDARY_BUTTON_CLASSES} text-base`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}
