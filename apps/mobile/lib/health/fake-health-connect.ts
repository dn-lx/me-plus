import type { SensorDiagnosticSnapshot, SensorReading } from "@me-plus/contracts";
import { reconcileSensorReadings } from "@me-plus/domain";

export type DiagnosticScenario = "exact" | "missing" | "mismatch" | "duplicate";

const SOURCE_PACKAGE = "com.meplus.fixture.healthconnect";

export const FAKE_HEALTH_READINGS: readonly SensorReading[] = [
  {
    externalId: "steps-2026-09-26-1",
    metric: "steps",
    value: 1842,
    unit: "count",
    observedAt: "2026-09-26T08:00:00.000Z",
    lastModifiedAt: "2026-09-26T08:05:00.000Z",
    provenance: {
      provider: "fake-health-connect",
      sourcePackage: SOURCE_PACKAGE,
      device: "Pixel fixture",
      recordingMethod: "automatic",
    },
  },
  {
    externalId: "steps-2026-09-26-2",
    metric: "steps",
    value: 2675,
    unit: "count",
    observedAt: "2026-09-26T12:00:00.000Z",
    lastModifiedAt: "2026-09-26T12:03:00.000Z",
    provenance: {
      provider: "fake-health-connect",
      sourcePackage: SOURCE_PACKAGE,
      device: "Pixel fixture",
      recordingMethod: "automatic",
    },
  },
  {
    externalId: "heart-rate-2026-09-26-1",
    metric: "heart-rate",
    value: 68,
    unit: "bpm",
    observedAt: "2026-09-26T12:15:00.000Z",
    lastModifiedAt: "2026-09-26T12:15:10.000Z",
    provenance: {
      provider: "fake-health-connect",
      sourcePackage: SOURCE_PACKAGE,
      device: "Wearable fixture",
      recordingMethod: "automatic",
    },
  },
  {
    externalId: "sleep-2026-09-26-1",
    metric: "sleep-duration",
    value: 438,
    unit: "minutes",
    observedAt: "2026-09-26T05:45:00.000Z",
    lastModifiedAt: "2026-09-26T06:00:00.000Z",
    provenance: {
      provider: "fake-health-connect",
      sourcePackage: SOURCE_PACKAGE,
      device: "Wearable fixture",
      recordingMethod: "automatic",
    },
  },
] as const;

function storedFixtureForScenario(scenario: DiagnosticScenario): SensorReading[] {
  const exact = FAKE_HEALTH_READINGS.map((reading) => ({
    ...reading,
    provenance: { ...reading.provenance },
  }));

  if (scenario === "missing") {
    return exact.slice(0, -1);
  }

  if (scenario === "mismatch") {
    return exact.map((reading) =>
      reading.metric === "heart-rate" ? { ...reading, value: reading.value + 7 } : reading,
    );
  }

  if (scenario === "duplicate") {
    return [...exact, { ...exact[0]!, provenance: { ...exact[0]!.provenance } }];
  }

  return exact;
}

export function runFakeSensorDiagnostics(scenario: DiagnosticScenario): SensorDiagnosticSnapshot {
  const storedReadings = storedFixtureForScenario(scenario);

  return {
    provider: "fake-health-connect",
    mode: "fixture",
    permissionStatus: "granted",
    checkedAt: "2026-09-26T21:50:00.000Z",
    readings: FAKE_HEALTH_READINGS,
    reconciliation: reconcileSensorReadings(FAKE_HEALTH_READINGS, storedReadings),
  };
}
