/** localStorage keys mirrored in PostgreSQL `user_ui_preferences.data`. */
export const USER_PREF_LS_KEYS = {
  columnVisibility: "budgetapp.columnVisibility.v1",
  valueInstances: "budgetapp.valueInstances.v1",
  balanceSidebarAccounts: "budgetapp.balanceSidebarAccounts.v1",
  /** Account names excluded from the combined total in the balance sidebar (still listed, grey). */
  balanceSidebarTotalExcluded: "budgetapp.balanceSidebarTotalExcluded.v1",
  accountOrder: "budgetapp.accountsOrder.v1",
  /** Account names added on the Accounts page (no transactions yet); merged into sidebar & pickers. */
  manualAccounts: "budgetapp.manualAccounts.v1",
  /** Soft-removed account names (restore or permanently clear the Accounts field). */
  deletedAccounts: "budgetapp.deletedAccounts.v1",
  /** Transaction modal picker: custom order for categories and subcategories (per category key). */
  txModalPickerOrder: "budgetapp.txModalPickerOrder.v1",
  /** Main display currency symbol + subcurrencies with rates to main (for formatting & totals). */
  currencySettings: "budgetapp.currencySettings.v1",
  /** Configured subcurrency codes hidden on Accounts + transaction Currency field (by code). */
  accountsSubcurrencyHidden: "budgetapp.accountsSubcurrencyHidden.v1",
} as const;
