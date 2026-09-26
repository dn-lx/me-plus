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
