"use client";

import { useEffect, useMemo, useState } from "react";
import { getBudgetLabels } from "@/lib/api";
import { applyAccountOrder, useAccountOrder } from "@/lib/accountOrder";
import {
  isAccountShownInBalanceSidebar,
  useBalanceSidebarHidden,
} from "@/lib/accountBalanceSidebarVisibility";
import { useAccountBalancesRefreshGeneration } from "@/lib/accountBalancesRefreshContext";
import { computeDisplayAccountNames } from "@/lib/accountsDisplayList";
import { useDeletedAccounts } from "@/lib/deletedAccounts";
import { useManualAccounts } from "@/lib/manualAccounts";

/**
 * Account names aligned with the Accounts page (`computeDisplayAccountNames`), then restricted
 * to accounts **shown** in the balance sidebar (same as clicking Show on the Accounts page).
 * Not the workbook facet alone, so the picker matches what you curate there.
 */
export function useVisibleAccountNames(
  _sheet: string,
  enabled: boolean,
): string[] {
  const sidebarHidden = useBalanceSidebarHidden();
  const accountOrder = useAccountOrder();
  const manualAccounts = useManualAccounts();
  const deletedAccounts = useDeletedAccounts();
  const refreshGen = useAccountBalancesRefreshGeneration();
  const [serverAccounts, setServerAccounts] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) {
      setServerAccounts([]);
      return;
    }
    let cancelled = false;
    getBudgetLabels()
      .then((r) => {
        if (!cancelled) setServerAccounts(r.accounts);
      })
      .catch(() => {
        if (!cancelled) setServerAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshGen]);

  const raw = useMemo(() => {
    const list = computeDisplayAccountNames(
      serverAccounts,
      manualAccounts,
      deletedAccounts,
    );
    return list.filter((a) =>
      isAccountShownInBalanceSidebar(sidebarHidden, a),
    );
  }, [
    serverAccounts,
    manualAccounts,
    deletedAccounts,
    sidebarHidden,
  ]);

  return useMemo(
    () => applyAccountOrder(raw, accountOrder),
    [raw, accountOrder],
  );
}
