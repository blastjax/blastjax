import type { Metadata } from "next";
import BloodPressureClient from "./BloodPressureClient";

export const metadata: Metadata = {
  title: "Blood Pressure",
  description: "Record and chart blood-pressure readings (systolic, diastolic, pulse)",
};

export default function BloodPressurePage() {
  return <BloodPressureClient />;
}
