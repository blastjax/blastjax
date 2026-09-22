"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRightIcon, TicketIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { getLottoGames, type LottoGame } from "@/lib/api";
import {
  CARD_CLASSES,
  ERROR_ALERT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
} from "@/lib/ui";

/** `/lotto` picks a game first — each one keeps its own draws and attempts,
 * all through the same page underneath. */
export default function LottoGamesPage() {
  const [games, setGames] = useState<LottoGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLottoGames()
      .then((r) => setGames(r.games))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load games."));
  }, []);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader title="Lotto" description="Pick a game to log draws and check your attempts." />

      {error && <p className={ERROR_ALERT_CLASSES}>{error}</p>}
      {!error && games === null && <p className={LOADING_TEXT_CLASSES}>Loading…</p>}

      {games && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game) => (
            <Link key={game.id} href={`/lotto/${game.id}`} className={`${CARD_CLASSES} group flex items-start gap-4`}>
              <span
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-text"
                aria-hidden
              >
                <TicketIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-base font-semibold tracking-[-0.2px] text-ink">
                    {game.name}
                  </span>
                  <ChevronRightIcon className="size-4 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
                </span>
                <span className="mt-1 block text-sm text-ink-3">
                  Draws and attempts for {game.name}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
