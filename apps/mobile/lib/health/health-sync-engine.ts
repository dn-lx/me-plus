import type { SensorReading } from '@me-plus/contracts';
import type { HealthChangePage } from './drain-health-changes';

type Bootstrap = { start: number; end: number; next: number; seed: string };
export type HealthSyncDependencies = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  assertActive: () => Promise<void>;
  readChanges: (token?: string) => Promise<HealthChangePage>;
  scan: (start: number, end: number) => Promise<readonly SensorReading[]>;
  upload: (readings: readonly SensorReading[]) => Promise<void>;
  now: () => number;
};

// Checkpoints contain only provider cursors/times. Never persist raw health payloads.
// Callers scope this storage by owner and exact Health Connect permission set.
export async function collectHealthChanges(deps: HealthSyncDependencies) {
  let token = deps.get('cursor');
  let pages = 0;
  let readings = 0;
  const upload = async (items: readonly SensorReading[]) => {
    for (let i = 0; i < items.length; i += 50) {
      await deps.assertActive();
      await deps.upload(items.slice(i, i + 50));
      readings += Math.min(50, items.length - i);
    }
    await deps.assertActive();
  };

  for (;;) {
    await deps.assertActive();
    if (!token) {
      const saved = deps.get('bootstrap');
      let state: Bootstrap;
      if (saved) {
        state = JSON.parse(saved) as Bootstrap;
        if (![state.start, state.end, state.next].every(Number.isFinite) ||
            typeof state.seed !== 'string' || !state.seed || state.next < state.start || state.next > state.end) {
          deps.remove('bootstrap');
          throw new Error('Invalid health checkpoint; retry the sync.');
        }
      } else {
        const seed = await deps.readChanges();
        if (!seed.nextChangesToken || seed.changesTokenExpired) throw new Error('Unable to seed health cursor.');
        // Seed first, then end the snapshot: intentional overlap avoids a gap
        // while Health Connect allocates the changes token.
        const end = deps.now();
        state = { start: end - 7 * 86_400_000, end, next: end - 7 * 86_400_000, seed: seed.nextChangesToken };
        deps.set('bootstrap', JSON.stringify(state));
      }
      // Fixed hourly windows allow a killed/limited worker to resume its backfill.
      while (state.next < state.end) {
        await deps.assertActive();
        const end = Math.min(state.next + 3_600_000, state.end);
        await upload(await deps.scan(state.next, end));
        state.next = end;
        deps.set('bootstrap', JSON.stringify(state));
      }
      await deps.assertActive();
      token = state.seed;
      deps.set('cursor', token);
      deps.remove('bootstrap');
    }
    await deps.assertActive();
    const page = await deps.readChanges(token);
    if (++pages > 100) throw new Error('Health changes page limit reached; retry to continue.');
    if (page.changesTokenExpired) {
      deps.remove('cursor');
      token = null;
      continue;
    }
    if (!page.nextChangesToken || (page.hasMore && page.nextChangesToken === token)) {
      throw new Error('Health changes cursor did not advance.');
    }
    await upload(page.readings);
    // Failed uploads or account/permission changes never advance a cursor.
    deps.set('cursor', page.nextChangesToken);
    token = page.nextChangesToken;
    if (!page.hasMore) return { readings, pages };
  }
}
