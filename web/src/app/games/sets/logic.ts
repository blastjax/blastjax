export const DEFAULT_BOARD_SIZE = 12;

export const SYMBOL_NAMES = ["Hourglass", "Star", "Cross"] as const;
export const TEXTURE_NAMES = ["Blank", "Stripes", "Full"] as const;
export const COUNT_LABELS = ["One", "Two", "Three"] as const;

export const COLOR_PALETTE = [
  { name: "Orange", hex: "#f97316" },
  { name: "Green", hex: "#22c55e" },
  { name: "Purple", hex: "#a855f7" },
] as const;

export interface Card {
  symbol: number;
  color: number;
  texture: number;
  count: number;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.symbol === b.symbol && a.color === b.color && a.texture === b.texture && a.count === b.count;
}

export function findCardIndex(cards: readonly Card[], card: Card): number {
  return cards.findIndex((c) => cardsEqual(c, card));
}

type Relation = "same" | "different" | "broken";

function featureRelation(x: number, y: number, z: number): Relation {
  if (x === y && y === z) return "same";
  if (x !== y && y !== z && x !== z) return "different";
  return "broken";
}

export interface SetBreakdown {
  symbol: Relation;
  color: Relation;
  texture: Relation;
  count: Relation;
  isSet: boolean;
}

export function breakdownSet(a: Card, b: Card, c: Card): SetBreakdown {
  const symbol = featureRelation(a.symbol, b.symbol, c.symbol);
  const color = featureRelation(a.color, b.color, c.color);
  const texture = featureRelation(a.texture, b.texture, c.texture);
  const count = featureRelation(a.count, b.count, c.count);
  return {
    symbol,
    color,
    texture,
    count,
    isSet: symbol !== "broken" && color !== "broken" && texture !== "broken" && count !== "broken",
  };
}

export function isSet(a: Card, b: Card, c: Card): boolean {
  return breakdownSet(a, b, c).isSet;
}

function thirdValue(x: number, y: number): number {
  return x === y ? x : 3 - x - y;
}

export function thirdCard(a: Card, b: Card): Card {
  return {
    symbol: thirdValue(a.symbol, b.symbol),
    color: thirdValue(a.color, b.color),
    texture: thirdValue(a.texture, b.texture),
    count: thirdValue(a.count, b.count),
  };
}

export function findAllSets(cards: readonly Card[]): [number, number, number][] {
  const sets: [number, number, number][] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        if (isSet(cards[i], cards[j], cards[k])) sets.push([i, j, k]);
      }
    }
  }
  return sets;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (let symbol = 0; symbol < 3; symbol++) {
    for (let color = 0; color < 3; color++) {
      for (let texture = 0; texture < 3; texture++) {
        for (let count = 0; count < 3; count++) {
          deck.push({ symbol, color, texture, count });
        }
      }
    }
  }
  return deck;
}

function shuffled<T>(arr: readonly T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dealBoard(size: number): Card[] {
  return shuffled(fullDeck()).slice(0, size);
}
