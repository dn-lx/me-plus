import type { EnableBankingAccount } from "./enable-banking";

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function identificationHashes(account: EnableBankingAccount | undefined): readonly string[] {
  if (!account) {
    return [];
  }

  const hashes = [
    account.identification_hash,
    ...(account.identification_hashes ?? []),
  ]
    .map((value) => nonEmpty(value))
    .filter((value): value is string => value !== null);

  return [...new Set(hashes)];
}

/**
 * Enable Banking account UIDs are session-scoped. identification_hash is the
 * provider-supported stable identity intended to match the same account across
 * reauthorizations/sessions. Prefer the detailed account response, then the
 * session account record.
 */
export function resolveProviderAccountIdentityHashes(
  account: EnableBankingAccount,
  sessionAccount?: EnableBankingAccount,
): readonly string[] {
  return [
    ...new Set([
      ...identificationHashes(account),
      ...identificationHashes(sessionAccount),
    ]),
  ];
}

export function resolveProviderAccountIdentityHash(
  account: EnableBankingAccount,
  sessionAccount?: EnableBankingAccount,
): string | null {
  return resolveProviderAccountIdentityHashes(account, sessionAccount)[0] ?? null;
}

export function isN26IdentityBootstrapMatch(
  stored: {
    account_type?: string | null;
    currency?: string | null;
    metadata?: unknown;
  },
  incoming: {
    accountType: string;
    currency: string;
    maskedIban: string | null;
    product: string | null;
  },
): boolean {
  const metadata =
    stored.metadata &&
    typeof stored.metadata === "object" &&
    !Array.isArray(stored.metadata)
      ? (stored.metadata as Record<string, unknown>)
      : {};

  const priorRefs = Array.isArray(metadata.previousExternalAccountRefs)
    ? metadata.previousExternalAccountRefs.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  const hasPriorReconciliationEvidence =
    priorRefs.length > 0 ||
    typeof metadata.accountIdentityReconciliationReason === "string";

  if (!hasPriorReconciliationEvidence || !incoming.maskedIban) {
    return false;
  }

  if (
    metadata.maskedIban !== incoming.maskedIban ||
    stored.account_type !== incoming.accountType ||
    stored.currency !== incoming.currency
  ) {
    return false;
  }

  if (
    typeof metadata.product === "string" &&
    incoming.product &&
    metadata.product !== incoming.product
  ) {
    return false;
  }

  return true;
}

/**
 * Raw-event idempotency must survive session UID rotation. Fall back to the
 * session UID only when the provider supplied no stable identity hash.
 */
export function n26RawTransactionExternalRecordId(
  providerAccountIdentityHash: string | null,
  accountUid: string,
  externalTransactionId: string,
): string {
  const accountKey = providerAccountIdentityHash
    ? `identity:${providerAccountIdentityHash}`
    : `uid:${accountUid}`;

  return `${accountKey}:${externalTransactionId}`;
}

export function previousExternalAccountRefs(
  metadata: unknown,
  previousRef: string | null,
  currentRef: string,
): string[] {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const existing = Array.isArray(record.previousExternalAccountRefs)
    ? record.previousExternalAccountRefs.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  const refs = new Set(existing);
  if (
    previousRef &&
    previousRef !== currentRef &&
    !previousRef.startsWith("superseded:")
  ) {
    refs.add(previousRef);
  }

  return [...refs];
}
