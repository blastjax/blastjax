import type { Metadata } from "next";
import PayslipClient from "./PayslipClient";

export const metadata: Metadata = {
  title: "Payslip",
  description: "Upload and track payslip totals",
};

export default function PayslipPage() {
  return <PayslipClient />;
}
