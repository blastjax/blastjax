import type { Metadata } from "next";
import MonthlyExpensesClient from "./MonthlyExpensesClient";

export const metadata: Metadata = {
  title: "Monthly Expenses",
  description: "Track recurring monthly expenses and split them across pay periods",
};

export default function MonthlyExpensesPage() {
  return <MonthlyExpensesClient />;
}
