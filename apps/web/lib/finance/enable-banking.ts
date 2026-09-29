import { createPrivateKey, createSign, type KeyObject } from "node:crypto";

const ENABLE_BANKING_API_URL = "https://api.enablebanking.com";

export interface EnableBankingAccount {
  uid: string;
  account_id?: {
    iban?: string;
    [key: string]: unknown;
  };
  all_account_ids?: readonly {
    identification?: string;
    scheme_name?: string;
    [key: string]: unknown;
  }[];
  account_servicer?: {
    name?: string;
    bic_fi?: string;
    [key: string]: unknown;
  };
  name?: string;
  details?: string;
  usage?: string;
  cash_account_type?: string;
  product?: string;
  currency?: string;
  psu_status?: string;
  identification_hash?: string;
  identification_hashes?: readonly string[];
  [key: string]: unknown;
}

export interface EnableBankingSession {
  session_id: string;
  accounts: readonly EnableBankingAccount[];
  aspsp: {
    name: string;
    country: string;
  };
  psu_type?: string;
  access?: {
    valid_until?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EnableBankingBalance {
  name?: string;
  balance_amount: {
    currency: string;
    amount: string;
  };
  balance_type?: string;
  credit_debit_indicator?: string;
  last_change_date_time?: string;
  reference_date?: string;
  [key: string]: unknown;
}

export interface EnableBankingTransaction {
  transaction_id?: string;
  entry_reference?: string;
  transaction_amount?: {
    currency?: string;
    amount?: string;
  };
  credit_debit_indicator?: string;
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  merchant_category_code?: string;
  creditor?: { name?: string; [key: string]: unknown };
  debtor?: { name?: string; [key: string]: unknown };
  bank_transaction_code?: {
    description?: string;
    code?: string;
    sub_code?: string;
    [key: string]: unknown;
  };
  remittance_information?: readonly string[];
  note?: string;
  [key: string]: unknown;
}

interface EnableBankingTransactionsResponse {
  transactions: readonly EnableBankingTransaction[];
  continuation_key?: string;
}

export class EnableBankingApiError extends Error {
  constructor(
    readonly status: number,
    readonly providerError: string | null,
    readonly requestId: string | null,
  ) {
    super(
      `Enable Banking request failed (${status})${providerError ? ` ${providerError}` : ""}${requestId ? ` [${requestId}]` : ""}`,
    );
    this.name = "EnableBankingApiError";
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parsePrivateKey(rawPrivateKey: string): KeyObject {
  const normalized = rawPrivateKey.replace(/\\n/g, "\n").trim();

  const candidates: Array<() => KeyObject> = [
    () => createPrivateKey(normalized),
  ];

  const compactBase64 = normalized.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compactBase64)) {
    const decoded = Buffer.from(compactBase64, "base64");
    candidates.push(
      () => createPrivateKey({ key: decoded, format: "der", type: "pkcs8" }),
      () => createPrivateKey({ key: decoded, format: "der", type: "pkcs1" }),
      () => createPrivateKey(decoded.toString("utf8")),
    );
  }

  for (const candidate of candidates) {
    try {
      const key = candidate();
      if (key.asymmetricKeyType !== "rsa") {
        continue;
      }
      return key;
    } catch {
      // Try the next supported representation.
    }
  }

  throw new Error("ENABLE_BANKING_PRIVATE_KEY is not a valid RSA private key");
}

function getConfig() {
  const applicationId = process.env.ENABLE_BANKING_APPLICATION_ID;
  const rawPrivateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL;

  if (!applicationId || !rawPrivateKey || !redirectUrl) {
    throw new Error(
      "Missing ENABLE_BANKING_APPLICATION_ID, ENABLE_BANKING_PRIVATE_KEY or ENABLE_BANKING_REDIRECT_URL",
    );
  }

  return {
    applicationId,
    privateKey: parsePrivateKey(rawPrivateKey),
    redirectUrl,
  };
}

function createApplicationJwt(): string {
  const { applicationId, privateKey } = getConfig();
  const now = Math.floor(Date.now() / 1000);

  const header = base64Url(
    JSON.stringify({
      typ: "JWT",
      alg: "RS256",
      kid: applicationId,
    }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 5 * 60,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${base64Url(signer.sign(privateKey))}`;
}

async function enableBankingRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${createApplicationJwt()}`);

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${ENABLE_BANKING_API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    let providerError: string | null = null;

    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        providerError = body.error;
      }
    } catch {
      // Keep the response diagnostic intentionally minimal.
    }

    throw new EnableBankingApiError(response.status, providerError, requestId);
  }

  return (await response.json()) as T;
}

export async function startN26Authorization(
  state: string,
): Promise<{ url: string; authorization_id?: string }> {
  const { redirectUrl } = getConfig();
  const validUntil = new Date(Date.now() + 179 * 24 * 60 * 60 * 1000).toISOString();

  return enableBankingRequest<{ url: string; authorization_id?: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        valid_until: validUntil,
      },
      aspsp: {
        name: "N26",
        country: "DE",
      },
      state,
      redirect_url: redirectUrl,
      psu_type: "personal",
      language: "en",
    }),
  });
}

export async function authorizeEnableBankingSession(
  code: string,
): Promise<EnableBankingSession> {
  return enableBankingRequest<EnableBankingSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getEnableBankingSession(
  sessionId: string,
): Promise<EnableBankingSession> {
  return enableBankingRequest<EnableBankingSession>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function getEnableBankingAccountDetails(
  accountId: string,
): Promise<EnableBankingAccount> {
  return enableBankingRequest<EnableBankingAccount>(
    `/accounts/${encodeURIComponent(accountId)}/details`,
  );
}

export async function getEnableBankingAccountBalances(
  accountId: string,
): Promise<readonly EnableBankingBalance[]> {
  const response = await enableBankingRequest<{ balances: EnableBankingBalance[] }>(
    `/accounts/${encodeURIComponent(accountId)}/balances`,
  );

  return response.balances ?? [];
}

export async function getEnableBankingAccountTransactions(
  accountId: string,
  options: {
    dateFrom?: string;
    dateTo?: string;
    continuationKey?: string;
  } = {},
): Promise<EnableBankingTransactionsResponse> {
  const params = new URLSearchParams();

  if (options.dateFrom) {
    params.set("date_from", options.dateFrom);
  }
  if (options.dateTo) {
    params.set("date_to", options.dateTo);
  }
  if (options.continuationKey) {
    params.set("continuation_key", options.continuationKey);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return enableBankingRequest<EnableBankingTransactionsResponse>(
    `/accounts/${encodeURIComponent(accountId)}/transactions${suffix}`,
  );
}
