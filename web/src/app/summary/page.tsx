import type { Metadata } from "next";
import DashboardClient from "../DashboardClient";

export const metadata: Metadata = {
  title: "Summary · Budget workbook",
  description: "Explore Excel data with filters, summaries, and charts",
};

export default function SummaryPage() {
  return <DashboardClient pageTitle="Summary" />;
}
