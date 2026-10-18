// Missing cutoff preserves legacy reconciliation. Invalid configuration fails closed.
export function ingestionCutoff(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.ingestFrom;
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("invalid_ingestion_cutoff");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error("invalid_ingestion_cutoff");
  return ms;
}

export function acceptsObservation(observedAt: string, cutoff: number | null): boolean {
  const ms = Date.parse(observedAt);
  return Number.isFinite(ms) && (cutoff === null || ms >= cutoff);
}

export function calendarWindow(now: Date, metadata: Record<string, unknown> | null) {
  const cutoff = ingestionCutoff(metadata);
  const start = Math.max(now.getTime() - 14 * 86400000, cutoff ?? -Infinity);
  const end = now.getTime() + 180 * 86400000;
  if (start >= end) throw new Error("invalid_ingestion_cutoff");
  return {start: new Date(start).toISOString(), end: new Date(end).toISOString()};
}
