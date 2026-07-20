import type { CSSProperties } from "react";
import type { BudgetTheme } from "./theme";

/**
 * Recharts `<Tooltip contentStyle={...}>` object, theme-aware. Previously this
 * exact object (light + dark variants) was hand-copied into Blood Pressure,
 * Commission, and Salary Stats — kept here once so the three charts stay in
 * sync and any future page just imports it.
 */
export function getChartTooltipStyle(theme: BudgetTheme): CSSProperties {
  return theme === "dark"
    ? {
        backgroundColor: "rgba(24, 24, 27, 0.92)",
        border: "1px solid rgb(63 63 70)",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#fafafa",
      }
    : {
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        border: "1px solid rgb(228 228 231)",
        borderRadius: "8px",
        fontSize: "12px",
        color: "#18181b",
      };
}
