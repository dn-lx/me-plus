import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEnableBankingSession } from "../apps/web/lib/finance/enable-banking.ts";

test("normalizes GET session account ids using accounts_data", () => {
  const session = normalizeEnableBankingSession(
    {
      status: "AUTHORIZED",
      accounts: ["497f6eca-6276-4993-bfeb-53cbbbba6f08"],
      accounts_data: [
        {
          uid: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
          identification_hash: "stable-account-hash",
        },
      ],
      aspsp: { name: "N26", country: "DE" },
      psu_type: "personal",
      access: { valid_until: "2027-03-25T18:08:19.170000Z" },
    },
    "session-123",
  );

  assert.equal(session.session_id, "session-123");
  assert.deepEqual(session.accounts, [
    {
      uid: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
      identification_hash: "stable-account-hash",
    },
  ]);
});

test("retains account ids even when accounts_data is incomplete", () => {
  const session = normalizeEnableBankingSession(
    {
      accounts: ["account-uid"],
      accounts_data: [],
      aspsp: { name: "N26", country: "DE" },
    },
    "session-456",
  );

  assert.deepEqual(session.accounts, [{ uid: "account-uid" }]);
});

test("preserves full account objects returned by session authorization", () => {
  const session = normalizeEnableBankingSession({
    session_id: "session-789",
    accounts: [
      {
        uid: "account-uid",
        identification_hash: "stable-account-hash",
      },
    ],
    aspsp: { name: "N26", country: "DE" },
  });

  assert.equal(session.session_id, "session-789");
  assert.equal(session.accounts[0]?.uid, "account-uid");
  assert.equal(
    session.accounts[0]?.identification_hash,
    "stable-account-hash",
  );
});
