import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Payslip defaults, companies, and users",
};

export default function SettingsPage() {
  return <SettingsClient />;
}
