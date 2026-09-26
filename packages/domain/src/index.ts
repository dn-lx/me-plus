import type {
  InsightRecord,
  MePlusDomain,
  ObservationRecord,
  SensorReading,
  SensorReconciliationResult,
} from "@me-plus/contracts";

export const ME_PLUS_DOMAINS = ["learning", "health", "finance", "time"] as const satisfies readonly MePlusDomain[];

export function isMePlusDomain(value: string): value is MePlusDomain {
  return (ME_PLUS_DOMAINS as readonly string[]).includes(value);
}

export function sourceObservationIds(observations: readonly ObservationRecord[]): readonly string[] {
  return observations.map((observation) => observation.id);
}

export function hasTraceableInsight(insight: InsightRecord): boolean {
  return insight.sourceObservationIds.length > 0;
}

function sensorReadingEquals(left: SensorReading, right: SensorReading): boolean {
  return (
    left.externalId === right.externalId &&
    left.metric === right.metric &&
    left.value === right.value &&
    left.unit === right.unit &&
    left.observedAt === right.observedAt &&
    left.lastModifiedAt === right.lastModifiedAt &&
    left.provenance.provider === right.provenance.provider &&
    left.provenance.sourcePackage === right.provenance.sourcePackage &&
    left.provenance.device === right.provenance.device &&
    left.provenance.recordingMethod === right.provenance.recordingMethod
  );
}

export function reconcileSensorReadings(
  source: readonly SensorReading[],
  stored: readonly SensorReading[],
): SensorReconciliationResult {
  const sourceIds = new Set(source.map((reading) => reading.externalId));
  const storedIds = new Set(stored.map((reading) => reading.externalId));
  const duplicateCount = source.length - sourceIds.size + (stored.length - storedIds.size);
  const storedById = new Map(stored.map((reading) => [reading.externalId, reading] as const));

  let matchedCount = 0;
  let missingCount = 0;
  let mismatchedCount = 0;

  for (const sourceReading of source) {
    const storedReading = storedById.get(sourceReading.externalId);

    if (!storedReading) {
      missingCount += 1;
      continue;
    }

    if (sensorReadingEquals(sourceReading, storedReading)) {
      matchedCount += 1;
    } else {
      mismatchedCount += 1;
    }
  }

  const extraStoredCount = [...storedIds].filter((id) => !sourceIds.has(id)).length;
  mismatchedCount += extraStoredCount;

  return {
    sourceCount: source.length,
    storedCount: stored.length,
    matchedCount,
    missingCount,
    mismatchedCount,
    duplicateCount,
    isExactMatch:
      duplicateCount === 0 &&
      missingCount === 0 &&
      mismatchedCount === 0 &&
      source.length === stored.length &&
      matchedCount === source.length,
  };
}
