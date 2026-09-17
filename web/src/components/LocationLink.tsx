"use client";

/** A place name that opens in Google Maps when a link is available (a
 * custom URL, or one auto-built from the name — see `mapsUrlFor`); plain
 * text otherwise. `null` if there's no name to show at all. */
export function LocationLink({ name, url }: { name: string | null; url: string | null }) {
  if (!name) return null;
  if (!url) {
    return <span className="text-ink-2">{name}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Google Maps"
      className="inline-flex items-center gap-1 text-brand-text underline-offset-2 hover:underline"
    >
      <span aria-hidden>📍</span>
      {name}
    </a>
  );
}
