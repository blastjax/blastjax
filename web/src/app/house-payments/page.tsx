import type { Metadata } from "next";
import HousePaymentsClient from "./HousePaymentsClient";

export const metadata: Metadata = {
  title: "House Payments",
  description: "Track in-house property installments (not mortgage)",
};

export default function HousePaymentsPage() {
  return <HousePaymentsClient />;
}
