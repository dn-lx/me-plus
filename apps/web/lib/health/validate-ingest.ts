import type {
  HealthConnectRawRecord,
  HealthConnectSensorRecordType,
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
const rawRecordTypes = new Set<HealthConnectSensorRecordType>([
  "ActiveCaloriesBurned",
  "BasalBodyTemperature",
  "BasalMetabolicRate",
  "BloodGlucose",
  "BloodPressure",
  "BodyFat",
  "BodyTemperature",
  "BodyWaterMass",
  "BoneMass",
  "CyclingPedalingCadence",
  "Distance",
  "ElevationGained",
  "ExerciseSession",
  "FloorsClimbed",
  "HeartRate",
  "HeartRateVariabilityRmssd",
  "Height",
  "LeanBodyMass",
  "OxygenSaturation",
  "Power",
  "RespiratoryRate",
  "RestingHeartRate",
  "SkinTemperature",
  "SleepSession",
  "Speed",
  "Steps",
  "StepsCadence",
  "TotalCaloriesBurned",
  "Vo2Max",
  "Weight",
  "WheelchairPushes",
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

const MAX_READINGS = 250;
const MAX_RAW_RECORDS = 100;
const MAX_RAW_PAYLOAD_BYTES = 160_000;
const MAX_SOURCE_METADATA_BYTES = 32_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new Error(`${field} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function assertJsonSize(value: unknown, field: string, maxBytes: number): void {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new Error(`${field} must be valid JSON`);
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`${field} exceeds the ${maxBytes}-byte limit`);
  }
}

function parseProvenance(value: unknown, field: string): SensorProvenance {
  if (!isRecord(value)) {
    throw new Error(`${field} is missing provenance`);
  }
  const provider = boundedString(value.provider, `${field} provider`, 64);
  if (!sensorProviders.has(provider as SensorProvenance["provider"])) {
    throw new Error(`${field} has an invalid provider`);
  }
  const sourcePackage = boundedString(value.sourcePackage, `${field} sourcePackage`, 300);
  const device =
    value.device === undefined ? undefined : boundedString(value.device, `${field} device`, 600);
  const recordingMethod =
    value.recordingMethod === undefined
      ? undefined
      : boundedString(value.recordingMethod, `${field} recordingMethod`, 160);

  return {
    provider: provider as SensorProvenance["provider"],
    sourcePackage,
    ...(device ? { device } : {}),
    ...(recordingMethod ? { recordingMethod } : {}),
  };
}

function parseSensorReading(value: unknown): SensorReading {
  if (!isRecord(value)) throw new Error("Each health reading must be an object");

  const externalId = boundedString(value.externalId, "Health reading externalId", 700);
  if (typeof value.metric !== "string" || !healthMetrics.has(value.metric as HealthMetric)) {
    throw new Error(`Unsupported health metric: ${String(value.metric)}`);
  }
  const metric = value.metric as HealthMetric;

  if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
    throw new Error(`Health reading ${externalId} must contain a finite numeric value`);
  }

  const unit = metricUnits[metric];
  if (value.unit !== unit) {
    throw new Error(`Health reading ${externalId} has an invalid unit for ${metric}`);
  }
  if (!isIsoTimestamp(value.observedAt) || !isIsoTimestamp(value.lastModifiedAt)) {
    throw new Error(`Health reading ${externalId} must contain valid timestamps`);
  }

  const provenance = parseProvenance(value.provenance, `Health reading ${externalId}`);
  if (value.sourcePayload !== undefined) {
    if (!isRecord(value.sourcePayload)) {
      throw new Error(`Health reading ${externalId} has an invalid sourcePayload`);
    }
    assertJsonSize(value.sourcePayload, `Health reading ${externalId} sourcePayload`, MAX_RAW_PAYLOAD_BYTES);
  }

  return {
    externalId,
    metric,
    value: value.value,
    unit,
    observedAt: value.observedAt,
    lastModifiedAt: value.lastModifiedAt,
    provenance,
    ...(value.sourcePayload ? { sourcePayload: value.sourcePayload } : {}),
  };
}

function parseRawRecord(value: unknown): HealthConnectRawRecord {
  if (!isRecord(value)) throw new Error("Each Health Connect raw record must be an object");
  const externalId = boundedString(value.externalId, "Health Connect raw record externalId", 700);
  if (typeof value.recordType !== "string" || !rawRecordTypes.has(value.recordType as HealthConnectSensorRecordType)) {
    throw new Error(`Unsupported Health Connect raw record type: ${String(value.recordType)}`);
  }
  if (!isIsoTimestamp(value.observedAt) || !isIsoTimestamp(value.lastModifiedAt)) {
    throw new Error(`Health Connect raw record ${externalId} must contain valid timestamps`);
  }
  const provenance = parseProvenance(value.provenance, `Health Connect raw record ${externalId}`);
  if (provenance.provider !== "health-connect") {
    throw new Error(`Health Connect raw record ${externalId} must use provider health-connect`);
  }
  if (!isRecord(value.payload)) {
    throw new Error(`Health Connect raw record ${externalId} must contain a payload object`);
  }
  assertJsonSize(value.payload, `Health Connect raw record ${externalId} payload`, MAX_RAW_PAYLOAD_BYTES);

  return {
    externalId,
    recordType: value.recordType as HealthConnectSensorRecordType,
    observedAt: value.observedAt,
    lastModifiedAt: value.lastModifiedAt,
    provenance,
    payload: value.payload,
  };
}

export function parseHealthIngestRequest(value: unknown): HealthIngestRequest {
  if (!isRecord(value) || !isRecord(value.source)) {
    throw new Error("Health ingestion payload must contain a source object");
  }

  const source = value.source;
  const provider = boundedString(source.provider, "Health ingestion source provider", 64);
  if (!sensorProviders.has(provider as SensorProvenance["provider"])) {
    throw new Error("Health ingestion source provider is invalid");
  }

  const displayName = boundedString(source.displayName, "Health ingestion source displayName", 240);
  const externalAccountRef =
    source.externalAccountRef === undefined
      ? undefined
      : boundedString(source.externalAccountRef, "Health ingestion externalAccountRef", 300);

  if (source.metadata !== undefined) {
    if (!isRecord(source.metadata)) throw new Error("Health ingestion source metadata must be an object");
    assertJsonSize(source.metadata, "Health ingestion source metadata", MAX_SOURCE_METADATA_BYTES);
  }

  if (!Array.isArray(value.readings)) {
    throw new Error("Health ingestion readings must be an array");
  }
  if (value.readings.length > MAX_READINGS) {
    throw new Error(`Health ingestion is limited to ${MAX_READINGS} normalized readings per request`);
  }

  const rawInput = value.rawRecords ?? [];
  if (!Array.isArray(rawInput)) {
    throw new Error("Health ingestion rawRecords must be an array");
  }
  if (rawInput.length > MAX_RAW_RECORDS) {
    throw new Error(`Health ingestion is limited to ${MAX_RAW_RECORDS} raw records per request`);
  }
  if (value.readings.length === 0 && rawInput.length === 0) {
    throw new Error("Health ingestion requires readings or rawRecords");
  }

  if (value.cursorAfter !== undefined && (typeof value.cursorAfter !== "string" || value.cursorAfter.length > 2048)) {
    throw new Error("Health ingestion cursorAfter is invalid");
  }

  const readings = value.readings.map(parseSensorReading);
  const rawRecords = rawInput.map(parseRawRecord);
  const typedProvider = provider as SensorProvenance["provider"];

  if (readings.some((reading) => reading.provenance.provider !== typedProvider)) {
    throw new Error("Every health reading provider must match the source provider");
  }
  if (rawRecords.some((record) => record.provenance.provider !== typedProvider)) {
    throw new Error("Every raw health record provider must match the source provider");
  }
  if (
    externalAccountRef &&
    (readings.some((reading) => reading.provenance.sourcePackage !== externalAccountRef) ||
      rawRecords.some((record) => record.provenance.sourcePackage !== externalAccountRef))
  ) {
    throw new Error("Every health record sourcePackage must match the source externalAccountRef");
  }

  return {
    source: {
      provider: typedProvider,
      displayName,
      ...(externalAccountRef ? { externalAccountRef } : {}),
      ...(source.metadata ? { metadata: source.metadata } : {}),
    },
    readings,
    ...(rawRecords.length ? { rawRecords } : {}),
    ...(value.cursorAfter ? { cursorAfter: value.cursorAfter } : {}),
  };
}
