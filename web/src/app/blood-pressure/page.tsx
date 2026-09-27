import type { Metadata } from "next";
import BloodPressureClient from "./BloodPressureClient";

export const metadata: Metadata = {
  title: "Health",
  description: "Log and chart blood pressure, pulse, SpO2, temperature, and weight",
};

export default function BloodPressurePage() {
  return <BloodPressureClient />;
}
