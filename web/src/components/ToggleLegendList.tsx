export interface ToggleLegendItem {
  key: string;
  label: string;
  color: string;
  hidden: boolean;
}

/** Clickable legend row — click an item to toggle its series on/off in the chart
 * above. Hidden items stay in the list (dimmed + struck through) so they can be
 * switched back on. Shared by any chart that wants "click the legend to hide a
 * series" instead of a separate checkbox list. */
export function ToggleLegendList({
  items,
  onToggle,
}: {
  items: ToggleLegendItem[];
  onToggle: (key: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-2">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={!item.hidden}
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm transition-opacity hover:opacity-80 ${
              item.hidden ? "opacity-40" : "opacity-100"
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span
              className={
                item.hidden
                  ? "text-zinc-500 line-through dark:text-zinc-500"
                  : "text-zinc-700 dark:text-zinc-300"
              }
            >
              {item.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
