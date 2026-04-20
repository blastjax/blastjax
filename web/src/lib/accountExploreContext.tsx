"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AccountExploreValue = {
  /** Exact `Accounts` cell value to filter the main dashboard (empty string = blank account). */
  accountDrillDown: string | null;
  setAccountDrillDown: (v: string | null) => void;
  /** Select this account, or clear if it is already selected. */
  toggleAccountDrillDown: (accountName: string) => void;
};

const AccountExploreContext = createContext<AccountExploreValue | null>(null);

export function AccountExploreProvider({ children }: { children: ReactNode }) {
  const [accountDrillDown, setAccountDrillDown] = useState<string | null>(null);

  const toggleAccountDrillDown = useCallback((accountName: string) => {
    setAccountDrillDown((prev) => (prev === accountName ? null : accountName));
  }, []);

  const value = useMemo(
    (): AccountExploreValue => ({
      accountDrillDown,
      setAccountDrillDown,
      toggleAccountDrillDown,
    }),
    [accountDrillDown, toggleAccountDrillDown],
  );

  return (
    <AccountExploreContext.Provider value={value}>
      {children}
    </AccountExploreContext.Provider>
  );
}

export function useAccountExplore(): AccountExploreValue | null {
  return useContext(AccountExploreContext);
}
