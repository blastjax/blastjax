import type { PayslipRow } from "@/lib/api";

export type Nav =
  | { screen: "detail"; row: PayslipRow }
  | { screen: "edit"; row: PayslipRow }
  | {
      screen: "add";
      year: number;
      month: number;
      half: 1 | 2;
      /** True when opened from Data tools' "+ Add payslip" rather than by
       * clicking a specific calendar slot — the period fields start
       * editable instead of locked to the slot that was clicked. */
      freeform?: boolean;
    };
