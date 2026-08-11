import type { Metadata } from "next";
import SetsClient from "./SetsClient";

export const metadata: Metadata = {
  title: "Sets",
  description: "Sets solving assistant: track the cards on the table and find every valid Set",
};

export default function SetsPage() {
  return <SetsClient />;
}
