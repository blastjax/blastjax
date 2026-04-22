/** Dispatched after creates/updates/deletes so lists and facets can refresh. */
export const TRANSACTIONS_CHANGED_EVENT = "budgetapp:transactions-changed";

/** Coalesce bursts of saves into one refresh (ms). */
export const TRANSACTIONS_CHANGED_DEBOUNCE_MS = 320;

/**
 * Listen for {@link TRANSACTIONS_CHANGED_EVENT} and run `callback` after a quiet period.
 * Returns an unsubscribe that clears any pending timer.
 */
export function subscribeTransactionsChangedDebounced(
  callback: () => void,
  debounceMs: number = TRANSACTIONS_CHANGED_DEBOUNCE_MS,
): () => void {
  if (typeof window === "undefined") return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onEvent = () => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, debounceMs);
  };
  window.addEventListener(TRANSACTIONS_CHANGED_EVENT, onEvent);
  return () => {
    window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, onEvent);
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
