import type { PayslipRow } from "@/lib/api";

export type Nav =
  | { screen: "detail"; row: PayslipRow }
  | { screen: "edit"; row: PayslipRow }
  | {
      screen: "add";
      year: number;
      month: number;
      half: 1 | 2;
      freeform?: boolean;
    };
