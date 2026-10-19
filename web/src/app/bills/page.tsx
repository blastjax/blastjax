import type { Metadata } from "next";
import BillsClient from "./BillsClient";

export const metadata: Metadata = {
  title: "Bills",
  description: "Bills by category, with each one's PDF, bill date, billing period and due date",
};

export default function BillsPage() {
  return <BillsClient />;
}
