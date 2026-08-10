import type { Metadata } from "next";
import MosaicClient from "./MosaicClient";

export const metadata: Metadata = {
  title: "Mosaic",
  description: "Flood-fill puzzle editor and step-by-step optimal solver",
};

export default function MosaicPage() {
  return <MosaicClient />;
}
