import type { Metadata } from "next";
import StatsClient from "./StatsClient";

export const metadata: Metadata = {
  title: "Stats · Budget workbook",
  description: "Category expense and income breakdowns",
};

export default function StatsPage() {
  return <StatsClient />;
}
