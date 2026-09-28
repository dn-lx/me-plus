import type { HealthConnectRecord } from "@me-plus/contracts";
import { Platform } from "react-native";

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
  records: HealthConnectRecord[];
};

type GenericRecord = Record<string, unknown> & {
  metadata?: {
    id?: string;
    dataOrigin?: string | null;
    device?: unknown;
    recordingMethod?: unknown;
    lastModifiedTime?: string;
  };
  time?: string;
  startTime?: string;
  endTime?: string;
};

type ReadPage = {
  records?: GenericRecord[];
  pageToken?: string | null;
};

export async function requestHealthConnectReadPermissions() {
  assertAndroid();
  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();

  if (!initialized) {
    throw new Error("Health Connect could not be initialized on this device.");
  }

  return healthConnect.requestPermission(
    HEALTH_CONNECT_RECORD_TYPES.map((recordType) => ({
      accessType: "read" as const,
      recordType,
    })) as never,
  );
}

export async function inventoryHealthConnect(days = 7): Promise<HealthConnectInventory> {
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

  const recordGroups = await Promise.all(
    HEALTH_CONNECT_RECORD_TYPES.map(async (recordType) => {
      try {
        const records = await readAllPages(healthConnect, recordType, timeRangeFilter);
        return { recordType, records, error: null };
      } catch (error) {
        return { recordType, records: [] as GenericRecord[], error: toErrorMessage(error) };
      }
    }),
  );

  const items: HealthConnectInventoryItem[] = recordGroups.map(({ recordType, records, error }) => ({
    recordType,
    count: records.length,
    dataOrigins: Array.from(
      new Set(
        records
          .map((record) => record.metadata?.dataOrigin)
          .filter((origin): origin is string => Boolean(origin)),
      ),
    ).sort(),
    latestObservedAt:
      records
        .map(observedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    error,
  }));

  const records = recordGroups.flatMap(({ recordType, records }) =>
    records.map((record, index) => toIngestRecord(recordType, record, index)),
  );

  return {
    platform: Platform.OS,
    initialized,
    permissionCount: grantedPermissions.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    items,
    records,
  };
}

async function readAllPages(
  healthConnect: typeof import("react-native-health-connect"),
  recordType: HealthConnectRecordType,
  timeRangeFilter: { operator: "between"; startTime: string; endTime: string },
): Promise<GenericRecord[]> {
  const all: GenericRecord[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 100; page += 1) {
    const result = (await healthConnect.readRecords(recordType as never, {
      timeRangeFilter,
      ascendingOrder: false,
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    } as never)) as ReadPage;

    all.push(...(result.records ?? []));
    const next = result.pageToken ?? undefined;
    if (!next) return all;
    pageToken = next;
  }

  throw new Error(`${recordType} exceeded the 100-page Health Connect safety limit.`);
}

function toIngestRecord(
  recordType: HealthConnectRecordType,
  record: GenericRecord,
  index: number,
): HealthConnectRecord {
  const observed = observedAt(record);
  if (!observed) {
    throw new Error(`${recordType} record is missing a timestamp.`);
  }

  const sourcePackage = record.metadata?.dataOrigin || "unknown-health-connect-origin";
  const externalId =
    record.metadata?.id ||
    [recordType, sourcePackage, record.startTime ?? record.time ?? observed, record.endTime ?? "", index].join(":");

  return {
    externalId,
    recordType,
    observedAt: observed,
    lastModifiedAt: record.metadata?.lastModifiedTime ?? observed,
    provenance: {
      provider: "health-connect",
      sourcePackage,
      ...(record.metadata?.device ? { device: describeDevice(record.metadata.device) } : {}),
      ...(record.metadata?.recordingMethod !== undefined
        ? { recordingMethod: String(record.metadata.recordingMethod) }
        : {}),
    },
    payload: record,
  };
}

function observedAt(record: GenericRecord): string | null {
  return record.endTime ?? record.startTime ?? record.time ?? null;
}

function describeDevice(device: unknown): string {
  if (typeof device === "string") return device;
  if (device && typeof device === "object") {
    const value = device as Record<string, unknown>;
    const parts = [value.manufacturer, value.model, value.type]
      .filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length) return parts.join(" ");
    try {
      return JSON.stringify(device);
    } catch {
      return "Health Connect device";
    }
  }
  return String(device);
}

function assertAndroid() {
  if (Platform.OS !== "android") {
    throw new Error("Health Connect collection is available only on Android.");
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Health Connect error";
}
