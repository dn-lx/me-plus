import { createHash, timingSafeEqual } from "node:crypto";

const EXPECTED_SCHEDULER_SECRET_SHA256 =
  "46a530eba00c6ba8cd6ceeecf9f75e18829851a921ce603ba7332ae0c4057e9f";

export function authorizedSchedulerRequest(request: Request): boolean {
  const actual = request.headers.get("x-me-plus-scheduler-secret");
  if (!actual) {
    return false;
  }

  const actualDigest = Buffer.from(
    createHash("sha256").update(actual).digest("hex"),
    "utf8",
  );
  const expectedDigest = Buffer.from(EXPECTED_SCHEDULER_SECRET_SHA256, "utf8");

  return timingSafeEqual(actualDigest, expectedDigest);
}
