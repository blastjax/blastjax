"use client";

import { renameAccountInOrder } from "@/lib/accountOrder";
import { renameAccountInBalanceSidebarHidden } from "@/lib/accountBalanceSidebarVisibility";
import { renameAccountInBalanceTotalExcluded } from "@/lib/accountBalanceTotalExclusion";
import { renameDeletedAccountLabel } from "@/lib/deletedAccounts";
import { renameManualAccountLabel } from "@/lib/manualAccounts";
import { renameAccountInValueVisibility } from "@/lib/valueInstanceVisibility";

/** Keep UI prefs in sync after renaming an account (DB or manual-only). */
export function applyAccountLabelRenameEverywhere(
  oldName: string,
  newName: string,
): void {
  if (oldName === newName) return;
  renameAccountInOrder(oldName, newName);
  renameAccountInBalanceSidebarHidden(oldName, newName);
  renameAccountInBalanceTotalExcluded(oldName, newName);
  renameAccountInValueVisibility(oldName, newName);
  renameManualAccountLabel(oldName, newName);
  renameDeletedAccountLabel(oldName, newName);
}
