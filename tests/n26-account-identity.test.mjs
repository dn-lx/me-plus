import assert from "node:assert/strict";
import test from "node:test";

import {
  isN26IdentityBootstrapMatch,
  n26RawTransactionExternalRecordId,
  previousExternalAccountRefs,
  resolveProviderAccountIdentityHash,
  resolveProviderAccountIdentityHashes,
} from "../apps/web/lib/finance/n26-account-identity.ts";

test("prefers stable provider account identity over session-scoped UID", () => {
  const sessionAccount = {
    uid: "session-uid-2",
    identification_hash: "stable-account-hash",
  };
  const details = {
    uid: "session-uid-2",
    identification_hash: "stable-account-hash",
  };

  assert.equal(
    resolveProviderAccountIdentityHash(details, sessionAccount),
    "stable-account-hash",
  );
});

test("uses identification_hashes when primary stable hash is absent", () => {
  const details = {
    uid: "session-uid-2",
    identification_hashes: ["stable-account-hash-v2", "legacy-hash"],
  };

  assert.equal(
    resolveProviderAccountIdentityHash(details),
    "stable-account-hash-v2",
  );
});

test("raw transaction identity is unchanged when session UID rotates", () => {
  assert.equal(
    n26RawTransactionExternalRecordId("stable-account-hash", "uid-old", "tx-1"),
    n26RawTransactionExternalRecordId("stable-account-hash", "uid-new", "tx-1"),
  );
});

test("without a stable identity, raw transaction identity remains UID-scoped", () => {
  assert.notEqual(
    n26RawTransactionExternalRecordId(null, "uid-old", "tx-1"),
    n26RawTransactionExternalRecordId(null, "uid-new", "tx-1"),
  );
});

test("preserves existing aliases and appends the replaced session UID once", () => {
  assert.deepEqual(
    previousExternalAccountRefs(
      { previousExternalAccountRefs: ["uid-original"] },
      "uid-old",
      "uid-new",
    ),
    ["uid-original", "uid-old"],
  );
  assert.deepEqual(
    previousExternalAccountRefs(
      { previousExternalAccountRefs: ["uid-old"] },
      "uid-old",
      "uid-new",
    ),
    ["uid-old"],
  );
});


test("retains current and historical provider identity hashes as match candidates", () => {
  assert.deepEqual(
    resolveProviderAccountIdentityHashes(
      {
        uid: "uid-new",
        identification_hash: "hash-new",
        identification_hashes: ["hash-new", "hash-old"],
      },
      { uid: "uid-new", identification_hash: "hash-old" },
    ),
    ["hash-new", "hash-old"],
  );
});

test("bootstrap matching requires prior reconciliation evidence and exact stored account signature", () => {
  const incoming = {
    accountType: "checking",
    currency: "EUR",
    maskedIban: "•••• 8308",
    product: "Individual Current Account",
  };

  assert.equal(
    isN26IdentityBootstrapMatch(
      {
        account_type: "checking",
        currency: "EUR",
        metadata: {
          maskedIban: "•••• 8308",
          product: "Individual Current Account",
          previousExternalAccountRefs: ["uid-old"],
        },
      },
      incoming,
    ),
    true,
  );

  assert.equal(
    isN26IdentityBootstrapMatch(
      {
        account_type: "checking",
        currency: "EUR",
        metadata: {
          maskedIban: "•••• 8308",
          product: "Individual Current Account",
        },
      },
      incoming,
    ),
    false,
  );

  assert.equal(
    isN26IdentityBootstrapMatch(
      {
        account_type: "checking",
        currency: "EUR",
        metadata: {
          maskedIban: "•••• 9999",
          product: "Individual Current Account",
          previousExternalAccountRefs: ["uid-old"],
        },
      },
      incoming,
    ),
    false,
  );
});
