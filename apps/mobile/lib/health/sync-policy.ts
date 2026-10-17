export const HEALTH_SYNC_INTERVAL_MINUTES = 180;
export const HEALTH_SYNC_INTERVAL_MS = HEALTH_SYNC_INTERVAL_MINUTES * 60_000;
export const HEALTH_SYNC_TASK = 'me-plus-health-connect-sync-v1';

export function syncIsDue(lastSuccess: string | null, now = Date.now()) {
  const previous = lastSuccess ? Date.parse(lastSuccess) : NaN;
  return !Number.isFinite(previous) || now < previous || now - previous >= HEALTH_SYNC_INTERVAL_MS;
}

// No health values, provider errors or credentials belong in persistent status.
export type SyncStatus = { lastSuccess: string | null; state: 'idle' | 'running' | 'synced' | 'retry' | 'permission_required' };
