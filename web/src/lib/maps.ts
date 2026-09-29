export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsUrlFor(
  name: string | null | undefined,
  customUrl: string | null | undefined,
): string | null {
  const trimmedUrl = customUrl?.trim();
  if (trimmedUrl) return trimmedUrl;
  const trimmedName = name?.trim();
  if (trimmedName) return googleMapsSearchUrl(trimmedName);
  return null;
}
