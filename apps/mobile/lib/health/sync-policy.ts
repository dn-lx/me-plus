export const HEALTH_SYNC_INTERVAL_MINUTES = 180;
export const HEALTH_SYNC_INTERVAL_MS = HEALTH_SYNC_INTERVAL_MINUTES * 60_000;
export const HEALTH_SYNC_TASK = 'me-plus-health-connect-sync-v1';

export function syncIsDue(lastSuccess: string | null, now = Date.now()) {
  const previous = lastSuccess ? Date.parse(lastSuccess) : NaN;
  return !Number.isFinite(previous) || now < previous || now - previous >= HEALTH_SYNC_INTERVAL_MS;
}

// No health values, provider errors or credentials belong in persistent status.
export type SyncStatus = { lastSuccess: string | null; state: 'idle' | 'running' | 'synced' | 'retry' | 'permission_required'; updatedAt?: string };

// Interrupted Android workers cannot leave a durable "running" status forever.
// A worker has a four-minute budget; allow one additional minute for shutdown.
export function normalizeHealthSyncStatus(value: unknown, now = Date.now()): SyncStatus {
  const saved = value as Partial<SyncStatus> | null;
  if (!saved || !['idle','running','synced','retry','permission_required'].includes(saved.state ?? '')) return { state:'idle', lastSuccess:null };
  const lastSuccess = typeof saved.lastSuccess === 'string' && Number.isFinite(Date.parse(saved.lastSuccess)) ? saved.lastSuccess : null;
  const updatedAt = typeof saved.updatedAt === 'string' && Number.isFinite(Date.parse(saved.updatedAt)) ? saved.updatedAt : undefined;
  const age = updatedAt ? now - Date.parse(updatedAt) : Infinity;
  return {state:saved.state === 'running' && (age < 0 || age >= 5*60_000) ? 'retry' : saved.state!,lastSuccess,...(updatedAt?{updatedAt}:{})};
}
