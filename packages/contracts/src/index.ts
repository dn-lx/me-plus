export type MePlusDomain = "learning" | "health" | "finance" | "time";

export type IsoTimestamp = string;

export interface ObservationRecord {
  id: string;
  userId: string;
  domain: MePlusDomain;
  source: string;
  observedAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  payload: Readonly<Record<string, unknown>>;
}

export interface InsightRecord {
  id: string;
  userId: string;
  domain: MePlusDomain;
  createdAt: IsoTimestamp;
  sourceObservationIds: readonly string[];
  summary: string;
  confidence?: number;
  payload: Readonly<Record<string, unknown>>;
}

export type ActionProposalStatus = "proposed" | "accepted" | "rejected" | "executed" | "cancelled";

export interface ActionProposal {
  id: string;
  userId: string;
  domain: MePlusDomain;
  createdAt: IsoTimestamp;
  status: ActionProposalStatus;
  title: string;
  rationale: string;
  payload: Readonly<Record<string, unknown>>;
}

export type HealthMetric = "steps" | "heart-rate" | "sleep-duration";

export type SensorPermissionStatus = "granted" | "denied" | "not-requested" | "unavailable";

export interface SensorProvenance {
  provider: "health-connect" | "fake-health-connect";
  sourcePackage: string;
  device?: string;
  recordingMethod?: string;
}

export interface SensorReading {
  externalId: string;
  metric: HealthMetric;
  value: number;
  unit: "count" | "bpm" | "minutes";
  observedAt: IsoTimestamp;
  lastModifiedAt: IsoTimestamp;
  provenance: SensorProvenance;
}

export interface SensorReconciliationResult {
  sourceCount: number;
  storedCount: number;
  matchedCount: number;
  missingCount: number;
  mismatchedCount: number;
  duplicateCount: number;
  isExactMatch: boolean;
}

export interface SensorDiagnosticSnapshot {
  provider: SensorProvenance["provider"];
  mode: "fixture" | "live";
  permissionStatus: SensorPermissionStatus;
  checkedAt: IsoTimestamp;
  readings: readonly SensorReading[];
  reconciliation: SensorReconciliationResult;
}

export interface HealthIngestSource {
  provider: SensorProvenance["provider"];
  displayName: string;
  externalAccountRef?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface HealthIngestRequest {
  source: HealthIngestSource;
  readings: readonly SensorReading[];
  cursorAfter?: string;
}

export interface HealthIngestResult {
  dataSourceId: string;
  syncRunId: string;
  recordsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
  observationIds: readonly string[];
}

export type BankConnectionProvider = "enable-banking";
export type BankInstitution = "n26";

export interface BankConnectionStartResult {
  provider: BankConnectionProvider;
  institution: BankInstitution;
  authorizationUrl: string;
}

export interface FinanceSyncResult {
  provider: BankConnectionProvider;
  institution: BankInstitution;
  dataSourceId: string;
  syncRunId: string;
  accountsSeen: number;
  transactionsSeen: number;
  recordsCreated: number;
  recordsUpdated: number;
}
