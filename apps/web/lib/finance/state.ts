import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface BankConnectionState {
  version: 1;
  userId: string;
  nonce: string;
  expiresAt: number;
}

function getStateSecret(): string {
  const secret = process.env.ENABLE_BANKING_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ENABLE_BANKING_STATE_SECRET must contain at least 32 characters");
  }
  return secret;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(encodedPayload: string): string {
  return base64Url(
    createHmac("sha256", getStateSecret()).update(encodedPayload).digest(),
  );
}

export function createBankConnectionState(userId: string): string {
  const payload: BankConnectionState = {
    version: 1,
    userId,
    nonce: randomBytes(18).toString("hex"),
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  const encodedPayload = base64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyBankConnectionState(state: string): BankConnectionState {
  const [encodedPayload, providedSignature, extra] = state.split(".");

  if (!encodedPayload || !providedSignature || extra !== undefined) {
    throw new Error("Invalid bank connection state");
  }

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new Error("Invalid bank connection state signature");
  }

  let payload: BankConnectionState;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as BankConnectionState;
  } catch {
    throw new Error("Invalid bank connection state payload");
  }

  if (
    payload.version !== 1 ||
    typeof payload.userId !== "string" ||
    payload.userId.length === 0 ||
    typeof payload.nonce !== "string" ||
    typeof payload.expiresAt !== "number"
  ) {
    throw new Error("Invalid bank connection state payload");
  }

  if (payload.expiresAt < Date.now()) {
    throw new Error("Bank connection state expired");
  }

  return payload;
}
