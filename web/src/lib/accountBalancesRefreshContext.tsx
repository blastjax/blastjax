"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AccountBalancesRefreshValue = {
  /** Increment to trigger account balance refetches (e.g. after saving a transaction). */
  refreshGeneration: number;
  bumpAccountBalancesRefresh: () => void;
};

const AccountBalancesRefreshContext =
  createContext<AccountBalancesRefreshValue | null>(null);

export function AccountBalancesRefreshProvider({ children }: { children: ReactNode }) {
  const [refreshGeneration, setGen] = useState(0);
  const bumpAccountBalancesRefresh = useCallback(() => {
    setGen((n) => n + 1);
  }, []);
  const value = useMemo(
    () => ({ refreshGeneration, bumpAccountBalancesRefresh }),
    [refreshGeneration, bumpAccountBalancesRefresh],
  );
  return (
    <AccountBalancesRefreshContext.Provider value={value}>
      {children}
    </AccountBalancesRefreshContext.Provider>
  );
}

/** Bump after mutations that affect per-account balances. No-op if provider is missing. */
export function useBumpAccountBalancesRefresh(): () => void {
  const ctx = useContext(AccountBalancesRefreshContext);
  return ctx?.bumpAccountBalancesRefresh ?? (() => {});
}

export function useAccountBalancesRefreshGeneration(): number {
  return useContext(AccountBalancesRefreshContext)?.refreshGeneration ?? 0;
}
