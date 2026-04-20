import { useEffect, useState } from "react";

/** 0 = refetch on every keystroke; use a positive value to wait after typing pauses (ms). */
export const SEARCH_DEBOUNCE_MS = 0;

/**
 * Controlled search input + debounced string for API `search_all`.
 * When `resetDeps` identity changes, both values clear (e.g. new sheet/month/account).
 */
export function useDebouncedSearch(
  resetDeps: unknown[],
  delayMs = SEARCH_DEBOUNCE_MS,
) {
  const resetKey = JSON.stringify(resetDeps);
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    setInput("");
    setDebounced("");
  }, [resetKey]);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(input);
      return;
    }
    const id = window.setTimeout(() => setDebounced(input), delayMs);
    return () => window.clearTimeout(id);
  }, [input, delayMs]);

  return { input, setInput, debounced };
}
