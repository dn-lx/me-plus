import type { InsightRecord, MePlusDomain, ObservationRecord } from "@me-plus/contracts";

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
