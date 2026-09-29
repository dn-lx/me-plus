import type { HealthIngestRequest, HealthIngestResult } from "@me-plus/contracts";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const REQUEST_TIMEOUT_MS = 30_000;

function parseResponseBody(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function isResult(value: unknown, count: number): value is HealthIngestResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return ["dataSourceId", "syncRunId"].every((key) =>
    typeof result[key] === "string" && result[key].length > 0) &&
    ["recordsSeen", "recordsCreated", "recordsUpdated"].every((key) =>
      Number.isSafeInteger(result[key]) && (result[key] as number) >= 0) &&
    result.recordsSeen === count &&
    (result.recordsCreated as number) + (result.recordsUpdated as number) <= count &&
    Array.isArray(result.observationIds) &&
    result.observationIds.every((id) => typeof id === "string" && id.length > 0);
}

export async function postHealthBatch(
  payload: HealthIngestRequest,
  accessToken: string,
  url: string,
  options: {
    fetch?: typeof fetch;
    wait?: (milliseconds: number) => Promise<void>;
    timeoutMs?: number;
  } = {},
): Promise<HealthIngestResult> {
  const fetchBatch = options.fetch ?? fetch;
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    let retryable = true;
    try {
      const response = await fetchBatch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = parseResponseBody(await response.text());
      if (response.ok) {
        retryable = false;
        if (!isResult(body, payload.readings.length)) {
          throw new Error("Me+ health API returned an invalid upload acknowledgement. No success was confirmed.");
        }
        return body;
      }
      retryable = RETRYABLE_STATUS_CODES.has(response.status);
      // Do not echo server HTML, request data or credentials into client logs/UI.
      throw new Error(`Health sync failed (${response.status}). ${response.status === 401 ? "Please sign in again." : "Please retry the upload."}`);
    } catch (error) {
      if (!retryable || attempt === MAX_ATTEMPTS) {
        if (controller.signal.aborted) throw new Error("Health upload timed out after bounded retries. Please retry the upload.");
        throw error instanceof Error ? error : new Error("Health upload network failure");
      }
    } finally {
      clearTimeout(timer);
    }
    await wait(750 * 2 ** (attempt - 1));
  }
  throw new Error("Health upload failed after bounded retries");
}
