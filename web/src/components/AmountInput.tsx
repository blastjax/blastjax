"use client";

import type { InputHTMLAttributes } from "react";
import { evaluateAmountExpression, formatAmountOnBlur } from "@/lib/parseFormNumber";
import { INPUT_CLASSES } from "@/lib/ui";

export type AmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "onChange" | "onBlur"
> & {
  value: string;
  onChange: (raw: string) => void;
  mode?: "amount" | "expression";
};

export function AmountInput({
  value,
  onChange,
  mode = "amount",
  className = "",
  ...rest
}: AmountInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`${INPUT_CLASSES} ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const next =
          mode === "expression"
            ? evaluateAmountExpression(e.target.value)
            : formatAmountOnBlur(e.target.value);
        if (next != null) onChange(next);
      }}
    />
  );
}
