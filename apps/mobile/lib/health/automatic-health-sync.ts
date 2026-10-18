import 'expo-sqlite/localStorage/install';
import { Platform } from 'react-native';
import { supabase } from '../supabase/client';
import { getHealthConnectPermissionState, readHealthConnectChanges, scanHealthConnect } from './health-connect';
import { syncHealthConnectReadings } from './sync-health-readings';
import { collectHealthChanges } from './health-sync-engine';
import { healthSyncScope } from './health-sync-scope';
import { syncIsDue, normalizeHealthSyncStatus, type SyncStatus } from './sync-policy';

const enabledKey = (owner: string) => `me-plus.health.auto.v1:${owner}`;
const statusKey = (owner: string) => `me-plus.health.status.v1:${owner}`;
let inFlight: Promise<void> | null = null;
let generation = 0;

export function automaticSyncEnabled(owner: string) {
  return localStorage.getItem(enabledKey(owner)) === 'true';
}

export function setAutomaticSyncEnabled(owner: string, enabled: boolean) {
  generation += 1;
  localStorage.setItem(enabledKey(owner), String(enabled));
}

export function cancelHealthSync() { generation += 1; }

export function getHealthSyncStatus(owner: string): SyncStatus {
  try {
    return normalizeHealthSyncStatus(JSON.parse(localStorage.getItem(statusKey(owner)) ?? 'null'));
  } catch { /* use empty status */ }
  return { state: 'idle', lastSuccess: null };
}

export function runAutomaticHealthSync(background = false, force = false): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = run(background, force).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(background: boolean, force: boolean) {
  if (Platform.OS !== 'android') return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Unable to read Me+ session.');
  const owner = data.session?.user.id;
  if (!owner || !automaticSyncEnabled(owner)) return;
  const current = getHealthSyncStatus(owner);
  if (!force && !syncIsDue(current.lastSuccess)) return;
  const permissions = await getHealthConnectPermissionState();
  const saveStatus = (state: SyncStatus['state'], lastSuccess = current.lastSuccess) => {
    localStorage.setItem(statusKey(owner), JSON.stringify({ state, lastSuccess, updatedAt: new Date().toISOString() }));
  };
  if (!permissions.recordReadTypes.length || (background && !permissions.backgroundRead)) {
    saveStatus('permission_required');
    return;
  }
  const scope = healthSyncScope(owner, permissions.recordReadTypes);
  const prefix = `me-plus.health.cursor.v3:${scope}:`;
  const startedGeneration = generation;
  const deadline = Date.now() + 4 * 60_000;
  const assertActive = async () => {
    const session = await supabase.auth.getSession();
    if (session.error || session.data.session?.user.id !== owner || generation !== startedGeneration || !automaticSyncEnabled(owner)) {
      throw new Error('Health sync stopped because the account or sync setting changed.');
    }
    if (Date.now() >= deadline) throw new Error('Health sync will continue on its next run.');
    const granted = await getHealthConnectPermissionState();
    if (healthSyncScope(owner, granted.recordReadTypes) !== scope || (background && !granted.backgroundRead)) {
      throw new Error('Health Connect permissions changed.');
    }
  };
  saveStatus('running');
  try {
    await collectHealthChanges({
      get: key => localStorage.getItem(prefix + key),
      set: (key, value) => localStorage.setItem(prefix + key, value),
      remove: key => localStorage.removeItem(prefix + key),
      assertActive,
      readChanges: token => readHealthConnectChanges(token, permissions.recordReadTypes),
      scan: async (start, end) => {
        const result = await scanHealthConnect((end - start) / 86_400_000, permissions.recordReadTypes, new Date(end));
        if (result.inventory.items.some(item => item.error)) throw new Error('Health Connect scan was incomplete.');
        return result.readings;
      },
      upload: async readings => { await syncHealthConnectReadings(readings, {}, { ownerId: owner, assertActive }); },
      now: Date.now,
      // Replaying overlaps is safe: Supabase keys by owner/source/external ID
      // and provider revision. Longer outages extend back to last acknowledgement.
      replayFrom: Math.min(Date.now() - 86_400_000,
        current.lastSuccess && Number.isFinite(Date.parse(current.lastSuccess)) ? Date.parse(current.lastSuccess) : Date.now() - 86_400_000),
    });
    await assertActive();
    saveStatus('synced', new Date().toISOString());
  } catch (cause) {
    saveStatus('retry');
    throw cause;
  }
}
