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
};

type GenericRecord = Record<string, unknown> & {
  metadata?: {
    dataOrigin?: string | null;
    device?: unknown;
  };
  time?: string;
  startTime?: string;
  endTime?: string;
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

  const items = await Promise.all(
    HEALTH_CONNECT_RECORD_TYPES.map(async (recordType): Promise<HealthConnectInventoryItem> => {
      try {
        const result = await healthConnect.readRecords(recordType as never, {
          timeRangeFilter,
          ascendingOrder: false,
          pageSize: 1000,
        } as never);
        const records = ((result as { records?: GenericRecord[] }).records ?? []) as GenericRecord[];
        const dataOrigins = Array.from(
          new Set(
            records
              .map((record) => record.metadata?.dataOrigin)
              .filter((origin): origin is string => Boolean(origin)),
          ),
        ).sort();

        const latestObservedAt = records
          .map((record) => record.endTime ?? record.startTime ?? record.time ?? null)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

        return {
          recordType,
          count: records.length,
          dataOrigins,
          latestObservedAt,
          error: null,
        };
      } catch (error) {
        return {
          recordType,
          count: 0,
          dataOrigins: [],
          latestObservedAt: null,
          error: toErrorMessage(error),
        };
      }
    }),
  );

  return {
    platform: Platform.OS,
    initialized,
    permissionCount: grantedPermissions.length,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    items,
  };
}

function assertAndroid() {
  if (Platform.OS !== "android") {
    throw new Error("Health Connect collection is available only on Android.");
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Health Connect error";
}
