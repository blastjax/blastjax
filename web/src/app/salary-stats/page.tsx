import type { Metadata } from "next";
import SalaryStatsClient from "./SalaryStatsClient";

export const metadata: Metadata = {
  title: "Salary Stats",
  description: "Charts for payslip components over time",
};

export default function SalaryStatsPage() {
  return <SalaryStatsClient />;
}
