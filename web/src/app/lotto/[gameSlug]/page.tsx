"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import LottoClient from "../LottoClient";
import { errorMessage, lottoGameSlug } from "@/lib/api";
import { queries } from "@/lib/queries";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks } from "@/components/FinanceUI";
import { ERROR_ALERT_CLASSES, PAGE_CONTAINER_CLASSES } from "@/lib/ui";

export default function LottoGameSlugPage() {
  const { gameSlug } = useParams<{ gameSlug: string }>();
  const { data, error } = useQuery(queries.lottoGames());
  // undefined while loading, null when no game has this slug
  const game = data && (data.games.find((g) => lottoGameSlug(g.name) === gameSlug) ?? null);

  if (error) {
    return (
      <div className={PAGE_CONTAINER_CLASSES}>
        <ErrorAlert>{errorMessage(error, "Failed to load games.")}</ErrorAlert>
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
