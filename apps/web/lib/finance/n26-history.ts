export function n26HistoryStart(metadata: Record<string, unknown> | null, now: Date): string {
  const configured = metadata?.ingestFromDate;
  if (configured === undefined || configured === null) {
    return new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  }
  if (typeof configured !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(configured) ||
    !Number.isFinite(Date.parse(configured)) || new Date(configured).toISOString().slice(0, 10) !== configured) {
    throw new Error("invalid_n26_history_start");
  }
  return configured;
}

export function n26TransactionInWindow(transaction: {booking_date?: string; transaction_date?: string; value_date?: string}, start: string): boolean {
  const value = transaction.booking_date || transaction.transaction_date || transaction.value_date || "";
  // Fail closed when a preferred provider date is malformed. Ingestion must
  // never fall back to an older date after the history guard accepted it.
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const date = new Date(parsed).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value !== date) return false;
  return /^(?:\d{4}-\d{2}-\d{2})(?:$|T)/.test(value) && date >= start;
}
