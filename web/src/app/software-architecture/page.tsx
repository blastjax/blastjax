import type { Metadata } from "next";
import SoftwareArchitectureClient from "./SoftwareArchitectureClient";

export const metadata: Metadata = {
  title: "Software Architecture",
  description: "How requests flow through Caddy, the API and its data stores, with the APIs and trust boundaries",
};

export default function SoftwareArchitecturePage() {
  return <SoftwareArchitectureClient />;
}
