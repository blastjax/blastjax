import type { Metadata } from "next";
import LottoClient from "../LottoClient";

type Params = { gameId: string };

export const metadata: Metadata = {
  title: "Lotto",
  description: "Track lotto results by date and check your attempts against them",
};

export default async function LottoGamePage({ params }: { params: Promise<Params> }) {
  const { gameId } = await params;
  return <LottoClient gameId={Number(gameId)} />;
}
