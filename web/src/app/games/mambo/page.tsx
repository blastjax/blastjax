import type { Metadata } from "next";
import MamboClient from "./MamboClient";

export const metadata: Metadata = {
  title: "Mambo",
  description:
    "Binary logic puzzle (Takuzu / Binairo) editor, generator and step-by-step solver",
};

export default function MamboPage() {
  return <MamboClient />;
}
