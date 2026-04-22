/**
 * Synthetic first column for data-preview tables: shows time-of-day from the
 * period column via {@link formatPeriodTimeOnly} (see Dashboard / stats modals).
 */
export const DATA_PREVIEW_TIME_COLUMN = "__data_preview_time__";

export function tableColumnsWithLeadingTime(
  visibleColumns: string[],
  periodColumn: string | null,
): { displayColumns: string[]; timeValueColumn: string | null } {
  if (!periodColumn) {
    return { displayColumns: visibleColumns, timeValueColumn: null };
  }
  const withoutPeriod = visibleColumns.filter((c) => c !== periodColumn);
  return {
    displayColumns: [DATA_PREVIEW_TIME_COLUMN, ...withoutPeriod],
    timeValueColumn: periodColumn,
  };
}

/** Resolve UI column id to real sheet column for sort / API. */
export function sortColumnForDataPreviewTable(
  displayColumn: string,
  timeValueColumn: string | null,
): string {
  if (
    timeValueColumn &&
    displayColumn === DATA_PREVIEW_TIME_COLUMN
  ) {
    return timeValueColumn;
  }
  return displayColumn;
}

export function isDataPreviewTimeColumnSortActive(
  displayColumn: string,
  sortColumn: string,
  timeValueColumn: string | null,
): boolean {
  if (displayColumn === DATA_PREVIEW_TIME_COLUMN) {
    return timeValueColumn != null && sortColumn === timeValueColumn;
  }
  return sortColumn === displayColumn;
}
