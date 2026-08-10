"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

/**
 * One `MediaQueryList` for the whole app, created lazily so this module stays
 * importable during SSR. `useSyncExternalStore` calls `getSnapshot` on every
 * render *and* again at commit to check for tearing, so building a fresh
 * `MediaQueryList` in there allocated one per render of every component using
 * this hook.
 */
let mediaQuery: MediaQueryList | null = null;

function query(): MediaQueryList {
  mediaQuery ??= window.matchMedia(QUERY);
  return mediaQuery;
}

function subscribe(onStoreChange: () => void) {
  const mq = query();
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return query().matches;
}

/** Server / first client paint: assume small viewport to avoid layout flash hiding mobile UI. */
function getServerSnapshot() {
  return false;
}

/** Matches Tailwind `lg` breakpoint (1024px). */
export function useLgUp(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
