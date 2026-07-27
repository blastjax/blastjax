import type { Metadata } from "next";
import CreditCardClient from "./CreditCardClient";

export const metadata: Metadata = {
  title: "Credit Card",
  description: "Track your credit card limit, statement balance, and payments",
};

export default function CreditCardPage() {
  return <CreditCardClient />;
}
