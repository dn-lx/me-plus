import type { ActionProposal, MePlusDomain, ObservationRecord } from "@me-plus/contracts";

export interface ReasoningRequest {
  userId: string;
  domain: MePlusDomain;
  observations: readonly ObservationRecord[];
  goal?: string;
}

export interface ReasoningResponse {
  summary: string;
  proposedActions: readonly ActionProposal[];
  evidenceObservationIds: readonly string[];
}

export interface ReasoningProvider {
  readonly id: string;
  reason(request: ReasoningRequest): Promise<ReasoningResponse>;
}

export interface DomainPolicy {
  readonly id: string;
  readonly domain: MePlusDomain;
  evaluate(request: ReasoningRequest, response: ReasoningResponse): Promise<ReasoningResponse> | ReasoningResponse;
}

export async function runReasoning(
  provider: ReasoningProvider,
  policies: readonly DomainPolicy[],
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  let response = await provider.reason(request);

  for (const policy of policies) {
    if (policy.domain === request.domain) {
      response = await policy.evaluate(request, response);
    }
  }

  return response;
}
