import { createHash, timingSafeEqual } from "node:crypto";

// Public verifier only: SHA-256 digest bytes of the high-entropy scheduler secret.
// The raw secret remains only in Supabase Vault.
const EXPECTED_SCHEDULER_SECRET_DIGEST = Uint8Array.from([
  70, 165, 48, 235, 160, 12, 107, 168,
  205, 108, 238, 236, 249, 247, 94, 24,
  130, 152, 81, 169, 33, 206, 96, 59,
  167, 51, 42, 224, 196, 5, 126, 159,
]);

export function authorizedSchedulerRequest(request: Request): boolean {
  const actual = request.headers.get("x-me-plus-scheduler-secret");
  if (!actual) {
    return false;
  }

  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = Buffer.from(EXPECTED_SCHEDULER_SECRET_DIGEST);

  return (
    actualDigest.length === expectedDigest.length &&
    timingSafeEqual(actualDigest, expectedDigest)
  );
}
