import type {
  HealthIngestRequest,
  HealthMetric,
  HealthUnit,
  SensorProvenance,
  SensorReading,
} from "@me-plus/contracts";

const healthMetrics = new Set<HealthMetric>([
  "steps",
  "heart-rate",
  "resting-heart-rate",
  "oxygen-saturation",
  "sleep-duration",
  "exercise-duration",
  "active-calories-burned",
  "total-calories-burned",
  "weight",
]);
const sensorProviders = new Set<SensorProvenance["provider"]>(["health-connect", "fake-health-connect"]);
const metricUnits: Record<HealthMetric, HealthUnit> = {
  steps: "count",
  "heart-rate": "bpm",
  "resting-heart-rate": "bpm",
  "oxygen-saturation": "percent",
  "sleep-duration": "minutes",
  "exercise-duration": "minutes",
  "active-calories-burned": "kilocalories",
  "total-calories-burned": "kilocalories",
  weight: "kilograms",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function parseSensorReading(value: unknown): SensorReading {
  if (!isRecord(value)) {
    throw new Error("Each health reading must be an object");
  }

  if (!isNonEmptyString(value.externalId)) {
    throw new Error("Health reading externalId is required");
  }

  if (!isNonEmptyString(value.metric) || !healthMetrics.has(value.metric as HealthMetric)) {
    throw new Error(`Unsupported health metric: ${String(value.metric)}`);
  }

  const metric = value.metric as HealthMetric;

  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    throw new Error(`Health reading ${value.externalId} must contain a finite numeric value`);
  }

  const unit = metricUnits[metric];

  if (value.unit !== unit) {
    throw new Error(`Health reading ${value.externalId} has an invalid unit for ${metric}`);
  }

  if (!isIsoTimestamp(value.observedAt) || !isIsoTimestamp(value.lastModifiedAt)) {
    throw new Error(`Health reading ${value.externalId} must contain valid timestamps`);
  }

  if (!isRecord(value.provenance)) {
    throw new Error(`Health reading ${value.externalId} is missing provenance`);
  }

  const provenance = value.provenance;

  if (
    !isNonEmptyString(provenance.provider) ||
    !sensorProviders.has(provenance.provider as SensorProvenance["provider"])
  ) {
    throw new Error(`Health reading ${value.externalId} has an invalid provider`);
  }

  if (!isNonEmptyString(provenance.sourcePackage)) {
    throw new Error(`Health reading ${value.externalId} is missing sourcePackage`);
  }

  if (provenance.device !== undefined && !isNonEmptyString(provenance.device)) {
    throw new Error(`Health reading ${value.externalId} has an invalid device`);
  }

  if (provenance.recordingMethod !== undefined && !isNonEmptyString(provenance.recordingMethod)) {
    throw new Error(`Health reading ${value.externalId} has an invalid recordingMethod`);
  }

  if (value.sourcePayload !== undefined && !isRecord(value.sourcePayload)) {
    throw new Error(`Health reading ${value.externalId} has an invalid sourcePayload`);
  }

  return {
    externalId: value.externalId,
    metric,
    value: value.value,
    unit,
    observedAt: value.observedAt,
    lastModifiedAt: value.lastModifiedAt,
    provenance: {
      provider: provenance.provider as SensorProvenance["provider"],
      sourcePackage: provenance.sourcePackage,
      ...(provenance.device ? { device: provenance.device } : {}),
      ...(provenance.recordingMethod ? { recordingMethod: provenance.recordingMethod } : {}),
    },
    ...(value.sourcePayload ? { sourcePayload: value.sourcePayload } : {}),
  };
}

export function parseHealthIngestRequest(value: unknown): HealthIngestRequest {
  if (!isRecord(value) || !isRecord(value.source)) {
    throw new Error("Health ingestion payload must contain a source object");
  }

  const source = value.source;

  if (
    !isNonEmptyString(source.provider) ||
    !sensorProviders.has(source.provider as SensorProvenance["provider"])
  ) {
    throw new Error("Health ingestion source provider is invalid");
  }

  if (!isNonEmptyString(source.displayName)) {
    throw new Error("Health ingestion source displayName is required");
  }

  if (source.externalAccountRef !== undefined && !isNonEmptyString(source.externalAccountRef)) {
    throw new Error("Health ingestion externalAccountRef is invalid");
  }

  if (source.metadata !== undefined && !isRecord(source.metadata)) {
    throw new Error("Health ingestion source metadata must be an object");
  }

  if (!Array.isArray(value.readings) || value.readings.length === 0) {
    throw new Error("Health ingestion requires at least one reading");
  }

  if (value.readings.length > 100) {
    throw new Error("Health ingestion is limited to 100 readings per request");
  }

  if (value.cursorAfter !== undefined && !isNonEmptyString(value.cursorAfter)) {
    throw new Error("Health ingestion cursorAfter is invalid");
  }

  const readings = value.readings.map(parseSensorReading);
  const provider = source.provider as SensorProvenance["provider"];

  if (readings.some((reading) => reading.provenance.provider !== provider)) {
    throw new Error("Every health reading provider must match the source provider");
  }

  if (
    source.externalAccountRef &&
    readings.some((reading) => reading.provenance.sourcePackage !== source.externalAccountRef)
  ) {
    throw new Error("Every health reading sourcePackage must match the source externalAccountRef");
  }

  return {
    source: {
      provider,
      displayName: source.displayName,
      ...(source.externalAccountRef ? { externalAccountRef: source.externalAccountRef } : {}),
      ...(source.metadata ? { metadata: source.metadata } : {}),
    },
    readings,
    ...(value.cursorAfter ? { cursorAfter: value.cursorAfter } : {}),
  };
}
