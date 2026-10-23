"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LottoClient from "../LottoClient";
import { getLottoGames, lottoGameSlug, type LottoGame } from "@/lib/api";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks } from "@/components/FinanceUI";
import { ERROR_ALERT_CLASSES, PAGE_CONTAINER_CLASSES } from "@/lib/ui";

export default function LottoGameSlugPage() {
  const { gameSlug } = useParams<{ gameSlug: string }>();
  const [game, setGame] = useState<LottoGame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLottoGames()
      .then((r) => setGame(r.games.find((g) => lottoGameSlug(g.name) === gameSlug) ?? null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load games."));
  }, [gameSlug]);

  if (error) {
    return (
      <div className={PAGE_CONTAINER_CLASSES}>
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    );
  }
  if (game === undefined) {
    return (
      <div className={PAGE_CONTAINER_CLASSES}>
        <LoadingBlocks label="Loading game…" />
      </div>
    );
  }
  if (game === null) {
    return (
      <div className={PAGE_CONTAINER_CLASSES}>
        <p className={ERROR_ALERT_CLASSES}>
          No lotto game named &quot;{gameSlug}&quot;.{" "}
          <Link href="/lotto" className="underline">
            Back to all games
          </Link>
          .
        </p>
      </div>
    );
  }
  return <LottoClient gameId={game.id} />;
}
