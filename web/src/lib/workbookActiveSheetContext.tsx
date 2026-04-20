"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Sheet name that should drive workbook-scoped APIs (e.g. account balances)
 * so the right-hand panel matches the sheet the user is viewing on the dashboard.
 */
type WorkbookActiveSheetContextValue = {
  activeSheet: string | null;
  setActiveSheet: (sheet: string | null) => void;
};

const WorkbookActiveSheetContext =
  createContext<WorkbookActiveSheetContextValue | null>(null);

export function WorkbookActiveSheetProvider({ children }: { children: ReactNode }) {
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const value = useMemo(
    (): WorkbookActiveSheetContextValue => ({
      activeSheet,
      setActiveSheet,
    }),
    [activeSheet],
  );
  return (
    <WorkbookActiveSheetContext.Provider value={value}>
      {children}
    </WorkbookActiveSheetContext.Provider>
  );
}

export function useWorkbookActiveSheet(): WorkbookActiveSheetContextValue {
  const ctx = useContext(WorkbookActiveSheetContext);
  if (!ctx) {
    throw new Error(
      "useWorkbookActiveSheet must be used within WorkbookActiveSheetProvider",
    );
  }
  return ctx;
}

export function useWorkbookActiveSheetOptional(): WorkbookActiveSheetContextValue | null {
  return useContext(WorkbookActiveSheetContext);
}
