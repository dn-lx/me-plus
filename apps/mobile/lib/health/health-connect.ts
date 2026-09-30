import type { SensorReading } from "@me-plus/contracts";
import { Platform } from "react-native";
import { sampleSourcePayload } from "./sample-source-payload";

export const HEALTH_CONNECT_RECORD_TYPES = [
  "HeartRate",
  "RestingHeartRate",
  "OxygenSaturation",
  "SleepSession",
  "Steps",
  "ExerciseSession",
  "ActiveCaloriesBurned",
  "TotalCaloriesBurned",
  "Weight",
] as const;

export type HealthConnectRecordType = (typeof HEALTH_CONNECT_RECORD_TYPES)[number];

export type HealthConnectInventoryItem = {
  recordType: HealthConnectRecordType;
  count: number;
  dataOrigins: string[];
  latestObservedAt: string | null;
  error: string | null;
};

export type HealthConnectInventory = {
  platform: string;
  initialized: boolean;
  permissionCount: number;
  windowStart: string;
  windowEnd: string;
  items: HealthConnectInventoryItem[];
};

export type HealthConnectScan = {
  inventory: HealthConnectInventory;
  readings: SensorReading[];
};

export type HealthConnectPermissionState = {
  initialized: boolean;
  recordReadPermissionCount: number;
  backgroundReadGranted: boolean;
};

export type HealthConnectChanges = {
  readings: SensorReading[];
  deletionCount: number;
  nextChangesToken: string;
  changesTokenExpired: boolean;
  hasMore: boolean;
};

type GenericMetadata = {
  id?: string | null;
  lastModifiedTime?: string | null;
  dataOrigin?: string | null;
  device?: unknown;
  recordingMethod?: unknown;
};

type HeartRateSample = {
  time?: string;
  beatsPerMinute?: number;
};

type GenericRecord = Record<string, unknown> & {
  recordType?: string;
  metadata?: GenericMetadata;
  time?: string;
  startTime?: string;
  endTime?: string;
  count?: number;
  beatsPerMinute?: number;
  percentage?: number;
  samples?: HeartRateSample[];
  energy?: {
    inKilocalories?: number;
  };
  weight?: {
    inKilograms?: number;
  };
};

type ReadRecordsResponse = {
  records?: GenericRecord[];
  pageToken?: string;
};

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export async function requestHealthConnectReadPermissions() {
  assertAndroid();
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();

  if (!initialized) {
    throw new Error("Health Connect could not be initialized on this device.");
  }

  return healthConnect.requestPermission(
    [
      ...HEALTH_CONNECT_RECORD_TYPES.map((recordType) => ({
        accessType: "read" as const,
        recordType,
      })),
      {
        accessType: "read" as const,
        recordType: "BackgroundAccessPermission" as const,
      },
    ] as never,
  );
}

export async function getHealthConnectPermissionState(): Promise<HealthConnectPermissionState> {
  assertAndroid();
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();

  if (!initialized) {
    throw new Error("Health Connect could not be initialized on this device.");
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const recordTypes = new Set<string>(HEALTH_CONNECT_RECORD_TYPES);

  return {
    initialized,
    recordReadPermissionCount: grantedPermissions.filter(
      (permission) =>
        permission.accessType === "read" &&
        recordTypes.has(String(permission.recordType)),
    ).length,
    backgroundReadGranted: grantedPermissions.some(
      (permission) =>
        permission.accessType === "read" &&
        permission.recordType === "BackgroundAccessPermission",
    ),
  };
}

export async function readHealthConnectChanges(
  changesToken?: string,
): Promise<HealthConnectChanges> {
  assertAndroid();
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();

  if (!initialized) {
    throw new Error("Health Connect could not be initialized on this device.");
  }

  const result = await healthConnect.getChanges({
    recordTypes: [...HEALTH_CONNECT_RECORD_TYPES],
    ...(changesToken ? { changesToken } : {}),
  } as never);

  const readings = result.upsertionChanges.flatMap((change, index) => {
    const record = change.record as unknown as GenericRecord;
    const recordType = record.recordType;

    if (
      typeof recordType !== "string" ||
      !HEALTH_CONNECT_RECORD_TYPES.includes(recordType as HealthConnectRecordType)
    ) {
      return [];
    }

    return mapRecordToReadings(recordType as HealthConnectRecordType, record, index);
  });

  return {
    readings,
    deletionCount: result.deletionChanges.length,
    nextChangesToken: result.nextChangesToken,
    changesTokenExpired: result.changesTokenExpired,
    hasMore: result.hasMore,
  };
}

export async function inventoryHealthConnect(days = 7): Promise<HealthConnectInventory> {
  return (await scanHealthConnect(days)).inventory;
}

export async function scanHealthConnect(days = 7): Promise<HealthConnectScan> {
  assertAndroid();
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();

  if (!initialized) {
    throw new Error("Health Connect could not be initialized on this device.");
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - days * 24 * 60 * 60 * 1000);
  const timeRangeFilter = {
    operator: "between" as const,
    startTime: windowStart.toISOString(),
    endTime: windowEnd.toISOString(),
  };

  const results = await Promise.all(
    HEALTH_CONNECT_RECORD_TYPES.map(async (recordType) => {
      try {
        const records = await readAllRecords(healthConnect, recordType, timeRangeFilter);
        const dataOrigins = Array.from(
          new Set(
            records
              .map((record) => record.metadata?.dataOrigin)
              .filter((origin): origin is string => Boolean(origin)),
          ),
        ).sort();

        const latestObservedAt =
          records
            .flatMap((record) => recordObservedTimes(record))
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? null;

        return {
          item: {
            recordType,
            count: records.length,
            dataOrigins,
            latestObservedAt,
            error: null,
          } satisfies HealthConnectInventoryItem,
          readings: records.flatMap((record, index) =>
            mapRecordToReadings(recordType, record, index),
          ),
        };
      } catch (error) {
        return {
          item: {
            recordType,
            count: 0,
            dataOrigins: [],
            latestObservedAt: null,
            error: toErrorMessage(error),
          } satisfies HealthConnectInventoryItem,
          readings: [] as SensorReading[],
        };
      }
    }),
  );

  return {
    inventory: {
      platform: Platform.OS,
      initialized,
      permissionCount: grantedPermissions.length,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      items: results.map((result) => result.item),
    },
    readings: results.flatMap((result) => result.readings),
  };
}

async function readAllRecords(
  healthConnect: typeof import("react-native-health-connect"),
  recordType: HealthConnectRecordType,
  timeRangeFilter: {
    operator: "between";
    startTime: string;
    endTime: string;
  },
): Promise<GenericRecord[]> {
  const records: GenericRecord[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const result = (await healthConnect.readRecords(recordType as never, {
      timeRangeFilter,
      ascendingOrder: false,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    } as never)) as ReadRecordsResponse;

    records.push(...(result.records ?? []));
    pageCount += 1;

    const nextPageToken = result.pageToken;
    if (!nextPageToken || nextPageToken === pageToken) {
      break;
    }

    pageToken = nextPageToken;

    if (pageCount >= MAX_PAGES) {
      throw new Error(
        `Health Connect pagination exceeded ${MAX_PAGES} pages for ${recordType}.`,
      );
    }
  } while (pageToken);

  return records;
}

function mapRecordToReadings(
  recordType: HealthConnectRecordType,
  record: GenericRecord,
  recordIndex: number,
): SensorReading[] {
  const sourcePackage = record.metadata?.dataOrigin?.trim() || "health-connect.unknown-origin";
  const device = formatDevice(record.metadata?.device);
  const recordingMethod = formatRecordingMethod(record.metadata?.recordingMethod);
  const lastModifiedAt =
    record.metadata?.lastModifiedTime ??
    record.endTime ??
    record.time ??
    record.startTime ??
    new Date(0).toISOString();
  const baseId =
    record.metadata?.id?.trim() ||
    [
      recordType,
      sourcePackage,
      record.startTime ?? record.time ?? "unknown-time",
      record.endTime ?? "",
      String(recordIndex),
    ].join(":");

  const provenance = {
    provider: "health-connect" as const,
    sourcePackage,
    ...(device ? { device } : {}),
    ...(recordingMethod ? { recordingMethod } : {}),
  };

  if (recordType === "HeartRate") {
    return (record.samples ?? []).flatMap((sample, sampleIndex) => {
      if (!isFiniteNumber(sample.beatsPerMinute)) {
        return [];
      }

      const observedAt = sample.time ?? record.endTime ?? record.startTime;
      if (!observedAt) {
        return [];
      }

      return [
        {
          externalId: `${baseId}:sample:${sample.time ?? sampleIndex}`,
          metric: "heart-rate" as const,
          value: sample.beatsPerMinute,
          unit: "bpm" as const,
          observedAt,
          lastModifiedAt,
          provenance,
          sourcePayload: sampleSourcePayload(record, sample, sampleIndex),
        },
      ];
    });
  }

  if (recordType === "RestingHeartRate" && isFiniteNumber(record.beatsPerMinute)) {
    return singleReading(
      baseId,
      "resting-heart-rate",
      record.beatsPerMinute,
      "bpm",
      record.time,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  if (recordType === "OxygenSaturation" && isFiniteNumber(record.percentage)) {
    return singleReading(
      baseId,
      "oxygen-saturation",
      record.percentage,
      "percent",
      record.time,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  if (recordType === "SleepSession") {
    const durationMinutes = intervalMinutes(record);
    if (durationMinutes !== null) {
      return singleReading(
        baseId,
        "sleep-duration",
        durationMinutes,
        "minutes",
        record.endTime,
        lastModifiedAt,
        provenance,
        record,
      );
    }
  }

  if (recordType === "Steps" && isFiniteNumber(record.count)) {
    return singleReading(
      baseId,
      "steps",
      record.count,
      "count",
      record.endTime,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  if (recordType === "ExerciseSession") {
    const durationMinutes = intervalMinutes(record);
    if (durationMinutes !== null) {
      return singleReading(
        baseId,
        "exercise-duration",
        durationMinutes,
        "minutes",
        record.endTime,
        lastModifiedAt,
        provenance,
        record,
      );
    }
  }

  if (
    recordType === "ActiveCaloriesBurned" &&
    isFiniteNumber(record.energy?.inKilocalories)
  ) {
    return singleReading(
      baseId,
      "active-calories-burned",
      record.energy.inKilocalories,
      "kilocalories",
      record.endTime,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  if (
    recordType === "TotalCaloriesBurned" &&
    isFiniteNumber(record.energy?.inKilocalories)
  ) {
    return singleReading(
      baseId,
      "total-calories-burned",
      record.energy.inKilocalories,
      "kilocalories",
      record.endTime,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  if (recordType === "Weight" && isFiniteNumber(record.weight?.inKilograms)) {
    return singleReading(
      baseId,
      "weight",
      record.weight.inKilograms,
      "kilograms",
      record.time,
      lastModifiedAt,
      provenance,
      record,
    );
  }

  return [];
}

function singleReading(
  externalId: string,
  metric: SensorReading["metric"],
  value: number,
  unit: SensorReading["unit"],
  observedAt: string | undefined,
  lastModifiedAt: string,
  provenance: SensorReading["provenance"],
  record: GenericRecord,
): SensorReading[] {
  if (!observedAt) {
    return [];
  }

  return [
    {
      externalId,
      metric,
      value,
      unit,
      observedAt,
      lastModifiedAt,
      provenance,
      sourcePayload: sourcePayload(record),
    },
  ];
}

function sourcePayload(
  record: GenericRecord,
  extra?: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  return {
    recordType: record.recordType ?? null,
    startTime: record.startTime ?? null,
    endTime: record.endTime ?? null,
    time: record.time ?? null,
    metadata: record.metadata ?? null,
    ...(extra ?? {}),
    sourceRecord: record,
  };
}

function intervalMinutes(record: GenericRecord): number | null {
  if (!record.startTime || !record.endTime) {
    return null;
  }

  const start = Date.parse(record.startTime);
  const end = Date.parse(record.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return (end - start) / 60_000;
}

function recordObservedTimes(record: GenericRecord): string[] {
  const values = [record.endTime, record.startTime, record.time];
  if (record.samples?.length) {
    values.push(...record.samples.map((sample) => sample.time));
  }

  return values.filter((value): value is string => Boolean(value));
}

function formatDevice(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number") {
    return `type:${value}`;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const device = value as Record<string, unknown>;
    const parts = [device.manufacturer, device.model]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());

    if (parts.length > 0) {
      return parts.join(" ");
    }

    if (device.type !== undefined && device.type !== null) {
      return `type:${String(device.type)}`;
    }
  }

  return undefined;
}

function formatRecordingMethod(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertAndroid() {
  if (Platform.OS !== "android") {
    throw new Error("Health Connect collection is available only on Android.");
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Health Connect error";
}
