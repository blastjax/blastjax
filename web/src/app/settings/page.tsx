import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Payslip defaults and chart colors",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
