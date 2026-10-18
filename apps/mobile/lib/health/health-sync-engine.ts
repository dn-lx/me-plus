import type { SensorReading } from '@me-plus/contracts';
import type { HealthConnectChanges as HealthChangePage } from './health-connect';

type Bootstrap = { start: number; end: number; next: number; seed: string };
export type HealthSyncDependencies = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
  assertActive: () => Promise<void>;
  readChanges: (token?: string) => Promise<HealthChangePage>;
  scan: (start: number, end: number) => Promise<readonly SensorReading[]>;
  upload: (readings: readonly SensorReading[]) => Promise<void>;
  fingerprint: (reading: SensorReading) => Promise<string>;
  now: () => number;
  replayFrom?: number;
};

// Checkpoints contain provider cursors/times and SHA-256 acknowledgement digests,
// never raw health payloads. Digests are scoped to one fixed scan or changes token.
// Callers scope this storage by owner and exact Health Connect permission set.
export async function collectHealthChanges(deps: HealthSyncDependencies) {
  let token = deps.get('cursor');
  let pages = 0;
  let readings = 0;
  const upload = async (items: readonly SensorReading[], scope: string) => {
    let acknowledged = new Set<string>();
    try {
      const saved = JSON.parse(deps.get('acknowledged') ?? 'null');
      if (saved?.scope === scope && Array.isArray(saved.hashes) &&
          saved.hashes.every((hash: unknown) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))) {
        acknowledged = new Set(saved.hashes);
      }
    } catch { /* Corrupt optional receipt cache safely replays, never skips. */ }
    for (let i = 0; i < items.length; i += 50) {
      await deps.assertActive();
      const batch = items.slice(i, i + 50);
      const hashes = await Promise.all(batch.map(item => deps.fingerprint(item)));
      if (hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid health receipt digest.');
      const pending = batch.filter((_item, index) => !acknowledged.has(hashes[index]!));
      if (!pending.length) continue;
      await deps.assertActive();
      await deps.upload(pending);
      await deps.assertActive();
      hashes.forEach(hash => acknowledged.add(hash));
      deps.set('acknowledged', JSON.stringify({ scope, hashes: [...acknowledged] }));
      readings += pending.length;
    }
    await deps.assertActive();
  };

  // Every due sync reconciles at least a rolling day. A persisted fixed window
  // resumes after a killed worker; it must never slide forward over unsent data.
  if (deps.replayFrom !== undefined || deps.get('replay')) {
    const saved = deps.get('replay');
    const end = deps.now();
    const replay = saved ? JSON.parse(saved) as { next: number; end: number } :
      { next: Math.min(deps.replayFrom ?? end - 86_400_000, end - 86_400_000), end };
    if (!Number.isFinite(replay.next) || !Number.isFinite(replay.end) || replay.next > replay.end) {
      throw new Error('Invalid health replay checkpoint.');
    }
    deps.set('replay', JSON.stringify(replay));
    while (replay.next < replay.end) {
      await deps.assertActive();
      const until = Math.min(replay.next + 3_600_000, replay.end);
      await upload(await deps.scan(replay.next, until), `replay:${replay.next}:${until}`);
      replay.next = until;
      deps.set('replay', JSON.stringify(replay));
      deps.remove('acknowledged');
    }
    await deps.assertActive();
  }

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
        await upload(await deps.scan(state.next, end), `bootstrap:${state.next}:${end}`);
        state.next = end;
        deps.set('bootstrap', JSON.stringify(state));
        deps.remove('acknowledged');
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
    await upload(page.readings, `changes:${token}`);
    // Failed uploads or account/permission changes never advance a cursor.
    deps.set('cursor', page.nextChangesToken);
    deps.remove('acknowledged');
    token = page.nextChangesToken;
    if (!page.hasMore) {
      deps.remove('replay');
      return { readings, pages };
    }
  }
}

