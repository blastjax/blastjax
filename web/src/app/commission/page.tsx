import type { Metadata } from "next";
import CommissionClient from "./CommissionClient";

export const metadata: Metadata = {
  title: "Commission",
  description: "Commission history and forecast",
};

export default function CommissionPage() {
  return <CommissionClient />;
}
