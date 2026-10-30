import type { Metadata } from "next";
import CreditCardClient from "./CreditCardClient";

export const metadata: Metadata = {
  title: "Credit Cards",
  description: "Track each credit card's limit, statement balance, and payments",
};

export default function CreditCardPage() {
  return <CreditCardClient />;
}
