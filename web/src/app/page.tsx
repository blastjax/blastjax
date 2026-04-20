import type { Metadata } from "next";
import CalendarClient from "./calendar/CalendarClient";

export const metadata: Metadata = {
  title: "Calendar · Budget workbook",
  description: "Income, expenses, and transfers by day",
};

export default function Home() {
  return <CalendarClient />;
}
