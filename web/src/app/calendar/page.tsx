import type { Metadata } from "next";
import CalendarClient from "./CalendarClient";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Monthly calendar with an approximate daily budget from your last salary",
};

export default function CalendarPage() {
  return <CalendarClient />;
}
