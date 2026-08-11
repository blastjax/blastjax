import { COLOR_PALETTE, type Card } from "./logic";

/** Stylised outlines for the three symbols, drawn on a 0-100 viewBox. */
const SYMBOL_PATHS: readonly string[] = [
  // Hourglass: two triangles joined at a point.
  "M20,15 L80,15 L50,50 L80,85 L20,85 L50,50 Z",
  // Star: a four-pointed sparkle with concave sides.
  "M50,4 C59,30 70,41 96,50 C70,59 59,70 50,96 C41,70 30,59 4,50 C30,41 41,30 50,4 Z",
  // Cross: a plus shape, rotated 45deg at render time into a diagonal X.
  "M35,5 L65,5 L65,35 L95,35 L95,65 L65,65 L65,95 L35,95 L35,65 L5,65 L5,35 L35,35 Z",
];

/** The cross symbol is drawn as an upright plus and rotated into an X so its
 * arms stay grid-aligned (easier to keep symmetric) until render time. */
const SYMBOL_TRANSFORMS: readonly (string | undefined)[] = [undefined, undefined, "rotate(45 50 50)"];

/** Renders one card symbol: outline for "blank", a diagonal-line pattern
 * fill for "stripes", and a solid fill for "full". */
export function SetSymbol({
  symbol,
  color,
  texture,
  size = 32,
}: {
  symbol: number;
  color: number;
  texture: number;
  size?: number;
}) {
  const hex = COLOR_PALETTE[color].hex;
  const patternId = `sets-stripes-${color}`;
  const fill = texture === 2 ? hex : texture === 1 ? `url(#${patternId})` : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke={hex} strokeWidth="3" />
        </pattern>
      </defs>
      <path
        d={SYMBOL_PATHS[symbol]}
        fill={fill}
        stroke={hex}
        strokeWidth={4}
        strokeLinejoin="round"
        transform={SYMBOL_TRANSFORMS[symbol]}
      />
    </svg>
  );
}

/** A card as it'd look on the table: 1-3 copies of its symbol side by side. */
export function CardTile({
  card,
  selected = false,
  size = "md",
}: {
  card: Card;
  selected?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const symbolSize = size === "sm" ? 18 : size === "lg" ? 56 : 30;
  const padding = size === "lg" ? "gap-2 px-5 py-5" : "gap-1 px-3 py-3";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border-2 bg-white shadow-sm dark:bg-zinc-900 ${padding} ${
        selected
          ? "border-indigo-500 ring-2 ring-indigo-400"
          : "border-zinc-200 dark:border-zinc-700"
      }`}
    >
      {Array.from({ length: card.count + 1 }, (_, i) => (
        <SetSymbol key={i} symbol={card.symbol} color={card.color} texture={card.texture} size={symbolSize} />
      ))}
    </span>
  );
}
