import type { SensorReading } from "@me-plus/contracts";
import { createHash } from "node:crypto";

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function providerRevisionKey(reading: SensorReading): string {
  const canonical = stableJson({
    externalId: reading.externalId,
    metric: reading.metric,
    value: reading.value,
    unit: reading.unit,
    observedAt: reading.observedAt,
    lastModifiedAt: reading.lastModifiedAt,
    provenance: reading.provenance,
    sourcePayload: reading.sourcePayload ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function compareProviderRevision(
  left: SensorReading,
  right: SensorReading,
): number {
  const modifiedDelta =
    timestampValue(left.lastModifiedAt) - timestampValue(right.lastModifiedAt);
  if (modifiedDelta !== 0) {
    return modifiedDelta;
  }

  const observedDelta =
    timestampValue(left.observedAt) - timestampValue(right.observedAt);
  if (observedDelta !== 0) {
    return observedDelta;
  }

  return providerRevisionKey(left).localeCompare(providerRevisionKey(right));
}

export function dedupeReadingsByFreshness(
  readings: readonly SensorReading[],
): SensorReading[] {
  const byExternalId = new Map<string, SensorReading>();

  for (const reading of readings) {
    const current = byExternalId.get(reading.externalId);
    if (!current || compareProviderRevision(reading, current) > 0) {
      byExternalId.set(reading.externalId, reading);
    }
  }

  return [...byExternalId.values()].sort((left, right) =>
    left.externalId.localeCompare(right.externalId),
  );
}


export type ProviderRevisionDecision = "create" | "update" | "resume" | "ignore";

export function decideProviderRevision(
  incoming: SensorReading,
  current: {
    reading: SensorReading | null;
    revisionKey: string | null;
    processingStatus: string | null;
  } | null,
): ProviderRevisionDecision {
  if (!current) {
    return "create";
  }

  const incomingKey = providerRevisionKey(incoming);
  const comparison = current.reading
    ? compareProviderRevision(incoming, current.reading)
    : 1;
  const sameRevision =
    current.revisionKey === incomingKey || comparison === 0;

  if (sameRevision) {
    return current.processingStatus === "processed" ? "ignore" : "resume";
  }

  return comparison < 0 ? "ignore" : "update";
}
