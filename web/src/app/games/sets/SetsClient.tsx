"use client";

import { PageHeader } from "@/components/PageHeader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACTION_BUTTON_CLASSES,
  CARD_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
} from "@/lib/ui";
import {
  breakdownSet,
  COLOR_PALETTE,
  COUNT_LABELS,
  dealBoard,
  DEFAULT_BOARD_SIZE,
  findAllSets,
  findCardIndex,
  SYMBOL_NAMES,
  TEXTURE_NAMES,
  thirdCard,
  type Card,
} from "./logic";
import { CardTile, SetSymbol } from "./shapes";

const EMPTY_BUILDER: Card = { symbol: 0, color: 0, texture: 0, count: 0 };
const sectionHeading = SECTION_LABEL_CLASSES;

/** Tone → semantic token classes for the banner boxes, the same
 * border/background/text triad `alertClasses()` in ui.ts builds, just
 * without its fixed padding so each banner can size itself. */
const ALERT_TONE_CLASSES: Record<"good" | "warn" | "bad", string> = {
  good: "border-success-line bg-success-soft text-success-text",
  warn: "border-warning-line bg-warning-soft text-warning-text",
  bad: "border-danger-line bg-danger-soft text-danger-text",
};

type Relation = "same" | "different" | "broken";

export default function SetsClient() {
  // Starts empty so server and client render the same markup, then deals a
  // random spread once mounted — dealBoard() uses Math.random(), which would
  // otherwise differ between the server render and the client hydration pass.
  const [board, setBoard] = useState<Card[]>([]);
  const [builder, setBuilder] = useState<Card>(EMPTY_BUILDER);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setBoard(dealBoard(DEFAULT_BOARD_SIZE));
  }, []);

  const allSets = useMemo(() => findAllSets(board), [board]);
  const selectedCards = selectedIndices.map((i) => board[i]);

  const pairThird = selectedCards.length === 2 ? thirdCard(selectedCards[0], selectedCards[1]) : null;
  const pairThirdBoardIndex = pairThird ? findCardIndex(board, pairThird) : -1;
  const tripleBreakdown =
    selectedCards.length === 3 ? breakdownSet(selectedCards[0], selectedCards[1], selectedCards[2]) : null;

  function addCard() {
    if (findCardIndex(board, builder) !== -1) {
      setAddError("That exact card is already on the board.");
      return;
    }
    setBoard((b) => [...b, { ...builder }]);
    setAddError(null);
  }

  function removeCard(idx: number) {
    setBoard((b) => b.filter((_, i) => i !== idx));
    setSelectedIndices((sel) => sel.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
  }

  function toggleSelect(idx: number) {
    setSelectedIndices((sel) => {
      if (sel.includes(idx)) return sel.filter((i) => i !== idx);
      if (sel.length >= 3) return [idx];
      return [...sel, idx];
    });
  }

  function dealNew(size: number) {
    setBoard(dealBoard(size));
    setSelectedIndices([]);
    setAddError(null);
  }

  function clearBoard() {
    setBoard([]);
    setSelectedIndices([]);
    setAddError(null);
  }

  const boardBanner =
    board.length < 3
      ? null
      : allSets.length > 0
        ? { tone: "good" as const, text: `${allSets.length} valid Set${allSets.length === 1 ? "" : "s"} on the board.` }
        : { tone: "warn" as const, text: "No valid Sets on the board — deal more cards or add another." };

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Sets"
        description={
          <>
            A solving assistant for Sets. Add the cards you see on the table and every valid Set among
            them is found automatically, or select two cards to see the exact card that completes one.
          </>
        }
      />

      <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:flex-wrap lg:items-start">
        <section className={`${CARD_CLASSES} w-full flex flex-col gap-6 lg:max-w-md lg:shrink-0`}>
          <div className="flex flex-col gap-4">
            <h2 className={sectionHeading}>Add a card</h2>

            <FeaturePicker label="Symbol">
              {SYMBOL_NAMES.map((name, i) => (
                <OptionTile key={name} label={name} selected={builder.symbol === i} onClick={() => setBuilder((c) => ({ ...c, symbol: i }))}>
                  <SetSymbol symbol={i} color={builder.color} texture={builder.texture} size={34} />
                </OptionTile>
              ))}
            </FeaturePicker>

            <FeaturePicker label="Color">
              {COLOR_PALETTE.map((c, i) => (
                <OptionTile key={c.name} label={c.name} selected={builder.color === i} onClick={() => setBuilder((b) => ({ ...b, color: i }))}>
                  <SetSymbol symbol={builder.symbol} color={i} texture={builder.texture} size={34} />
                </OptionTile>
              ))}
            </FeaturePicker>

            <FeaturePicker label="Texture">
              {TEXTURE_NAMES.map((name, i) => (
                <OptionTile key={name} label={name} selected={builder.texture === i} onClick={() => setBuilder((c) => ({ ...c, texture: i }))}>
                  <SetSymbol symbol={builder.symbol} color={builder.color} texture={i} size={34} />
                </OptionTile>
              ))}
            </FeaturePicker>

            <FeaturePicker label="Count">
              {COUNT_LABELS.map((name, i) => (
                <OptionTile key={name} label={name} selected={builder.count === i} onClick={() => setBuilder((c) => ({ ...c, count: i }))}>
                  <span className="flex items-center gap-1">
                    {Array.from({ length: i + 1 }, (_, n) => (
                      <SetSymbol key={n} symbol={builder.symbol} color={builder.color} texture={builder.texture} size={20} />
                    ))}
                  </span>
                </OptionTile>
              ))}
            </FeaturePicker>

            <div className="flex items-center justify-between gap-4 pt-2">
              <CardTile card={builder} size="lg" />
              <button type="button" className={`${PRIMARY_BUTTON_CLASSES} px-6 py-3 text-base`} onClick={addCard}>
                Add to board
              </button>
            </div>
            {addError && <p className="text-xs text-danger-text">{addError}</p>}
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h2 className={sectionHeading}>Board</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ACTION_BUTTON_CLASSES} onClick={() => dealNew(DEFAULT_BOARD_SIZE)}>
                Deal {DEFAULT_BOARD_SIZE} random
              </button>
              <button type="button" className={ACTION_BUTTON_CLASSES} onClick={clearBoard}>
                Clear board
              </button>
            </div>
            <p className="text-xs text-ink-3">{board.length} card{board.length === 1 ? "" : "s"} on the board</p>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h2 className={sectionHeading}>How to use it</h2>
            <ul className="flex flex-col gap-1 text-xs text-ink-2">
              <li>· Every card has 4 features — Symbol, Color, Texture, Count — each with 3 variants.</li>
              <li>· Three cards form a Set when each feature, on its own, is all the same or all different across them.</li>
              <li>· Add the cards you see on the table (or deal a random spread) and every valid Set is listed below automatically.</li>
              <li>· Click 2 board cards to see the exact card that would complete a Set with them.</li>
              <li>· Click 3 to check whether your own pick is valid, and which feature broke it if not.</li>
            </ul>
          </div>
        </section>

        <section className="flex w-full min-w-0 flex-col gap-4 lg:flex-1">
          {boardBanner && (
            <div
              className={`w-full max-w-md rounded-lg border px-4 py-3 text-sm font-medium ${ALERT_TONE_CLASSES[boardBanner.tone]}`}
            >
              {boardBanner.text}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {board.length === 0 && (
              <p className="text-sm text-ink-3">
                No cards yet — add one on the left, or deal a random spread.
              </p>
            )}
            {board.map((card, idx) => (
              <div key={idx} className="relative">
                <button type="button" onClick={() => toggleSelect(idx)} aria-label={`Select card ${idx + 1}`}>
                  <CardTile card={card} selected={selectedIndices.includes(idx)} />
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(idx)}
                  aria-label={`Remove card ${idx + 1}`}
                  title="Remove"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-surface text-[10px] leading-none text-ink-2 shadow transition-colors duration-150 hover:bg-danger-soft hover:text-danger-text dark:shadow-none dark:ring-1 dark:ring-white/10"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {selectedIndices.length > 0 && (
            <div className={`${CARD_CLASSES} flex flex-col gap-3`}>
              <div className="flex items-center justify-between">
                <h2 className={sectionHeading}>
                  {selectedCards.length === 3 ? "Is this a Set?" : "Complete the Set"}
                </h2>
                <button
                  type="button"
                  className="text-xs text-ink-3 underline hover:text-ink-2"
                  onClick={() => setSelectedIndices([])}
                >
                  Clear selection
                </button>
              </div>

              {selectedCards.length === 1 && (
                <p className="text-xs text-ink-3">
                  Select a second card to see what completes a Set, or a third to check your own pick.
                </p>
              )}

              {selectedCards.length === 2 && pairThird && (
                <div className="flex items-center gap-4">
                  <CardTile card={pairThird} size="sm" />
                  <p className="text-sm text-ink-2">
                    {pairThirdBoardIndex !== -1 ? (
                      <>
                        This card is already on the board (card {pairThirdBoardIndex + 1}) — select it too for a
                        complete Set.
                      </>
                    ) : (
                      "This card would complete a Set — it isn't on the board yet."
                    )}
                  </p>
                </div>
              )}

              {selectedCards.length === 3 && tripleBreakdown && (
                <div className="flex flex-col gap-2">
                  <div
                    className={`w-fit rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      ALERT_TONE_CLASSES[tripleBreakdown.isSet ? "good" : "bad"]
                    }`}
                  >
                    {tripleBreakdown.isSet ? "✓ Valid Set" : "✗ Not a Set"}
                  </div>
                  <FeatureRow label="Symbol" relation={tripleBreakdown.symbol} />
                  <FeatureRow label="Color" relation={tripleBreakdown.color} />
                  <FeatureRow label="Texture" relation={tripleBreakdown.texture} />
                  <FeatureRow label="Count" relation={tripleBreakdown.count} />
                </div>
              )}
            </div>
          )}

          {allSets.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className={sectionHeading}>Sets found</h2>
              <div className="flex flex-col gap-2">
                {allSets.map(([i, j, k], setIdx) => (
                  <button
                    key={`${i}-${j}-${k}`}
                    type="button"
                    onClick={() => setSelectedIndices([i, j, k])}
                    className="flex w-fit items-center gap-3 rounded-lg border border-transparent p-1 transition-colors duration-150 hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-900 dark:hover:bg-indigo-950/30"
                  >
                    <span className="w-10 shrink-0 text-xs text-ink-4">Set {setIdx + 1}</span>
                    <CardTile card={board[i]} size="sm" />
                    <CardTile card={board[j]} size="sm" />
                    <CardTile card={board[k]} size="sm" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FeaturePicker({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-ink-2">
      {label}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function OptionTile({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={`flex flex-1 items-center justify-center rounded-lg border-2 bg-surface px-3 py-3 shadow-sm transition-colors duration-150 dark:shadow-none ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-400"
          : "border-line hover:border-indigo-300 dark:ring-1 dark:ring-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function FeatureRow({ label, relation }: { label: string; relation: Relation }) {
  const text = relation === "broken" ? "mismatched" : relation;
  const tone =
    relation === "broken" ? "text-danger-text" : "text-success-text";
  return (
    <p className="text-sm text-ink-2">
      {label}: <span className={`font-semibold ${tone}`}>{text}</span>
    </p>
  );
}
