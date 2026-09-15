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
  /** "amount" (default) reformats to `n,nnn.nn` on blur; "expression" evaluates
   * `+`/`-` arithmetic first (e.g. "100-10") — see `evaluateAmountExpression`. */
  mode?: "amount" | "expression";
};

/**
 * A free-text money field: `type="text"` + `inputMode="decimal"` (never
 * `type="number"`, which would reject thousands separators and mid-typed
 * arithmetic), reformatted — or evaluated, in "expression" mode — once the
 * field loses focus. Every amount field in the app should render through
 * this instead of hand-rolling the same input + onBlur pair.
 */
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
