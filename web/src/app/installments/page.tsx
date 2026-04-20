import type { Metadata } from "next";
import InstallmentsClient from "./InstallmentsClient";

export const metadata: Metadata = {
  title: "Installments",
  description: "Track installment loans and payments",
};

export default function InstallmentsPage() {
  return <InstallmentsClient />;
}
