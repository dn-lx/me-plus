import { createHash } from "node:crypto";

import type { FinanceSyncResult } from "@me-plus/contracts";

import { createAdminClient } from "../supabase/admin";
import {
  getEnableBankingAccountBalances,
  getEnableBankingAccountDetails,
  getEnableBankingAccountTransactions,
  type EnableBankingAccount,
  type EnableBankingBalance,
  type EnableBankingSession,
  type EnableBankingTransaction,
} from "./enable-banking";

type AdminClient = ReturnType<typeof createAdminClient>;

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toTimestamp(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function amountFromBalance(balance: EnableBankingBalance | undefined): number | null {
  if (!balance) {
    return null;
  }

  const amount = Number(balance.balance_amount.amount);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return balance.credit_debit_indicator === "DBIT" ? -Math.abs(amount) : amount;
}

function pickBalance(
  balances: readonly EnableBankingBalance[],
  types: readonly string[],
): EnableBankingBalance | undefined {
  for (const type of types) {
    const match = balances.find((balance) => balance.balance_type === type);
    if (match) {
      return match;
    }
  }

  return balances[0];
}

function accountType(cashAccountType: string | undefined): string {
  switch (cashAccountType) {
    case "CACC":
      return "checking";
    case "SVGS":
      return "savings";
    case "CARD":
      return "card";
    default:
      return cashAccountType?.toLowerCase() || "bank";
  }
}

function maskedIban(account: EnableBankingAccount): string | null {
  const iban = account.account_id?.iban;
  if (!iban || iban.length < 4) {
    return null;
  }

  return `•••• ${iban.slice(-4)}`;
}

async function upsertDataSource(
  client: AdminClient,
  userId: string,
  session: EnableBankingSession,
): Promise<string> {
  const { data, error } = await client
    .from("data_sources")
    .upsert(
      {
        user_id: userId,
        kind: "bank_account_feed",
        provider: "enable-banking",
        display_name: "N26",
        status: "active",
        external_account_ref: session.session_id,
        metadata: {
          institution: "n26",
          aspsp: session.aspsp,
          psuType: session.psu_type ?? "personal",
          consentValidUntil: session.access?.valid_until ?? null,
          accountUids: session.accounts.map((account) => account.uid),
        },
      },
      { onConflict: "user_id,provider,display_name" },
    )
    .select("id")
    .single();

  throwIfError(error, "Unable to upsert N26 data source");

  if (!data?.id) {
    throw new Error("Unable to resolve N26 data source id");
  }

  return data.id;
}

async function grantFinanceConsent(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  validUntil: string | undefined,
): Promise<void> {
  const existing = await client
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .eq("domain", "finance")
    .eq("purpose", "read_only_account_information")
    .maybeSingle();

  throwIfError(existing.error, "Unable to look up finance consent");

  const metadata = {
    provider: "enable-banking",
    institution: "n26",
    validUntil: validUntil ?? null,
    access: "accounts_balances_transactions",
    readOnly: true,
  };

  if (existing.data?.id) {
    const updated = await client
      .from("consents")
      .update({
        status: "granted",
        revoked_at: null,
        metadata,
      })
      .eq("id", existing.data.id);
    throwIfError(updated.error, "Unable to update finance consent");
    return;
  }

  const inserted = await client.from("consents").insert({
    user_id: userId,
    data_source_id: dataSourceId,
    domain: "finance",
    purpose: "read_only_account_information",
    status: "granted",
    granted_at: new Date().toISOString(),
    revoked_at: null,
    metadata,
  });

  throwIfError(inserted.error, "Unable to record finance consent");
}

async function startSyncRun(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
): Promise<string> {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const recovered = await client
    .from("source_sync_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: "stale_running_sync_recovered",
    })
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .eq("status", "running")
    .lt("started_at", staleBefore);

  throwIfError(recovered.error, "Unable to recover stale N26 sync run");

  const { data, error } = await client
    .from("source_sync_runs")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      status: "running",
      metadata: {
        ingestion: "me-plus-finance-v1",
        provider: "enable-banking",
        institution: "n26",
      },
    })
    .select("id")
    .single();

  if (error && "code" in error && error.code === "23505") {
    throw new Error("N26 sync already running for this data source");
  }

  throwIfError(error, "Unable to start N26 sync run");

  if (!data?.id) {
    throw new Error("Unable to resolve N26 sync run id");
  }

  return data.id;
}

async function syncFinancialAccount(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  account: EnableBankingAccount,
  balances: readonly EnableBankingBalance[],
): Promise<{ id: string; created: boolean }> {
  const currentBalance = pickBalance(balances, ["CLBD", "ITBD", "CLAV"]);
  const availableBalance = pickBalance(balances, ["CLAV", "ITAV", "FWAV"]);
  const balanceReference =
    currentBalance?.last_change_date_time ??
    currentBalance?.reference_date ??
    availableBalance?.last_change_date_time ??
    availableBalance?.reference_date;
  const balanceAsOf = toTimestamp(balanceReference) ?? new Date().toISOString();

  const values = {
    provider: "n26",
    account_type: accountType(account.cash_account_type),
    display_name: account.name || account.product || "N26 account",
    currency:
      account.currency ??
      currentBalance?.balance_amount.currency ??
      availableBalance?.balance_amount.currency ??
      "EUR",
    current_balance: amountFromBalance(currentBalance),
    available_balance: amountFromBalance(availableBalance),
    balance_as_of: balanceAsOf,
    active: true,
    metadata: {
      upstreamProvider: "enable-banking",
      usage: account.usage ?? null,
      product: account.product ?? null,
      cashAccountType: account.cash_account_type ?? null,
      psuStatus: account.psu_status ?? null,
      maskedIban: maskedIban(account),
      accountServicer: account.account_servicer?.name ?? "N26",
    },
  };

  const existing = await client
    .from("financial_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .eq("external_account_ref", account.uid)
    .eq("active", true)
    .maybeSingle();

  throwIfError(existing.error, `Unable to look up N26 account ${account.uid}`);

  if (existing.data?.id) {
    const updated = await client
      .from("financial_accounts")
      .update(values)
      .eq("id", existing.data.id);

    throwIfError(updated.error, `Unable to update N26 account ${account.uid}`);
    return { id: existing.data.id, created: false };
  }

  const candidates = await client
    .from("financial_accounts")
    .select("id,external_account_ref,metadata")
    .eq("user_id", userId)
    .eq("data_source_id", dataSourceId)
    .eq("active", true);

  throwIfError(candidates.error, "Unable to inspect existing N26 account identities");

  const currentMaskedIban = maskedIban(account);
  const identityMatches = (candidates.data ?? []).filter((candidate) => {
    const metadata = candidate.metadata as Record<string, unknown> | null;
    return Boolean(
      currentMaskedIban &&
        metadata?.maskedIban === currentMaskedIban &&
        metadata?.upstreamProvider === "enable-banking",
    );
  });

  if (identityMatches.length > 1) {
    throw new Error(
      `Ambiguous N26 account identity after reconnect for ${currentMaskedIban}`,
    );
  }

  if (identityMatches.length === 1) {
    const candidate = identityMatches[0];
    const previousRef = candidate.external_account_ref;
    const updated = await client
      .from("financial_accounts")
      .update({
        external_account_ref: account.uid,
        ...values,
        metadata: {
          ...values.metadata,
          previousExternalAccountRefs: previousRef ? [previousRef] : [],
          accountIdentityReconciliationReason:
            "enable-banking account UID rotated after reconnect",
          accountIdentityReconciledAt: new Date().toISOString(),
        },
      })
      .eq("id", candidate.id);

    throwIfError(updated.error, `Unable to rebind N26 account ${account.uid}`);
    return { id: candidate.id, created: false };
  }

  const inserted = await client
    .from("financial_accounts")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      external_account_ref: account.uid,
      ...values,
    })
    .select("id")
    .single();

  throwIfError(inserted.error, `Unable to insert N26 account ${account.uid}`);

  if (!inserted.data?.id) {
    throw new Error(`Unable to resolve N26 account ${account.uid}`);
  }

  return { id: inserted.data.id, created: true };
}

async function syncRawTransaction(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  stableAccountId: string,
  externalTransactionId: string,
  transaction: EnableBankingTransaction,
): Promise<{ id: string; created: boolean }> {
  const providerRecordId = `${stableAccountId}:${externalTransactionId}`;
  const observedAt =
    toTimestamp(transaction.booking_date) ??
    toTimestamp(transaction.transaction_date) ??
    toTimestamp(transaction.value_date);
  const payloadHash = stableHash(transaction);

  const existing = await client
    .from("raw_events")
    .select("id")
    .eq("data_source_id", dataSourceId)
    .eq("external_record_id", providerRecordId)
    .maybeSingle();

  throwIfError(
    existing.error,
    `Unable to look up raw N26 transaction ${externalTransactionId}`,
  );

  const values = {
    event_type: "finance.n26.transaction",
    observed_at: observedAt,
    payload: transaction,
    payload_schema_version: "enable-banking-v1",
    content_hash: payloadHash,
    processing_status: "pending",
    processed_at: null,
    error_code: null,
  };

  if (existing.data?.id) {
    const updated = await client
      .from("raw_events")
      .update(values)
      .eq("id", existing.data.id);
    throwIfError(
      updated.error,
      `Unable to update raw N26 transaction ${externalTransactionId}`,
    );
    return { id: existing.data.id, created: false };
  }

  const inserted = await client
    .from("raw_events")
    .insert({
      user_id: userId,
      data_source_id: dataSourceId,
      external_record_id: providerRecordId,
      ...values,
    })
    .select("id")
    .single();

  if (!inserted.error && inserted.data?.id) {
    return { id: inserted.data.id, created: true };
  }

  if (inserted.error && "code" in inserted.error && inserted.error.code === "23505") {
    const raced = await client
      .from("raw_events")
      .select("id")
      .eq("data_source_id", dataSourceId)
      .eq("external_record_id", providerRecordId)
      .single();

    throwIfError(
      raced.error,
      `Unable to recover concurrent N26 transaction ${externalTransactionId}`,
    );

    if (!raced.data?.id) {
      throw new Error(
        `Unable to resolve concurrent N26 transaction ${externalTransactionId}`,
      );
    }

    return { id: raced.data.id, created: false };
  }

  throwIfError(
    inserted.error,
    `Unable to insert raw N26 transaction ${externalTransactionId}`,
  );
  throw new Error(`Unable to insert raw N26 transaction ${externalTransactionId}`);
}

async function markRawTransaction(
  client: AdminClient,
  rawEventId: string,
  status: "processed" | "failed",
  errorCode: string | null = null,
): Promise<void> {
  const updated = await client
    .from("raw_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_code: errorCode,
    })
    .eq("id", rawEventId);

  throwIfError(updated.error, "Unable to update raw N26 transaction status");
}

function transactionDescription(transaction: EnableBankingTransaction): string {
  const remittance = transaction.remittance_information
    ?.map((value) => value.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    remittance ||
    transaction.note ||
    transaction.creditor?.name ||
    transaction.debtor?.name ||
    "N26 transaction"
  );
}

async function syncFinancialTransaction(
  client: AdminClient,
  userId: string,
  dataSourceId: string,
  financialAccountId: string,
  accountUid: string,
  transaction: EnableBankingTransaction,
): Promise<{ created: boolean; normalized: boolean }> {
  const providerTransactionId =
    transaction.transaction_id ||
    transaction.entry_reference ||
    stableHash(transaction);
  const rawEvent = await syncRawTransaction(
    client,
    userId,
    dataSourceId,
    financialAccountId,
    providerTransactionId,
    transaction,
  );

  const bookedAt =
    toTimestamp(transaction.booking_date) ??
    toTimestamp(transaction.transaction_date) ??
    toTimestamp(transaction.value_date);
  const valueAt = toTimestamp(transaction.value_date);
  const unsignedAmount = Number(transaction.transaction_amount?.amount);

  if (!bookedAt || !Number.isFinite(unsignedAmount)) {
    await markRawTransaction(
      client,
      rawEvent.id,
      "failed",
      "invalid_normalization_fields",
    );
    return { created: rawEvent.created, normalized: false };
  }

  const amount =
    transaction.credit_debit_indicator === "DBIT"
      ? -Math.abs(unsignedAmount)
      : Math.abs(unsignedAmount);
  const merchant =
    transaction.credit_debit_indicator === "CRDT"
      ? transaction.debtor?.name
      : transaction.creditor?.name;

  const values = {
    user_id: userId,
    data_source_id: dataSourceId,
    booked_at: bookedAt,
    value_at: valueAt,
    amount,
    currency: transaction.transaction_amount?.currency ?? "EUR",
    merchant: merchant ?? null,
    description: transactionDescription(transaction),
    category: null,
    transaction_type:
      transaction.bank_transaction_code?.description ??
      transaction.bank_transaction_code?.code ??
      transaction.credit_debit_indicator ??
      null,
    recurring_candidate: false,
    metadata: {
      upstreamProvider: "enable-banking",
      institution: "n26",
      accountUid,
      rawEventId: rawEvent.id,
      providerStatus: transaction.status ?? null,
      entryReference: transaction.entry_reference ?? null,
      merchantCategoryCode: transaction.merchant_category_code ?? null,
      bankTransactionCode: transaction.bank_transaction_code ?? null,
    },
  };

  const existing = await client
    .from("financial_transactions")
    .select("id")
    .eq("financial_account_id", financialAccountId)
    .eq("external_transaction_id", providerTransactionId)
    .maybeSingle();

  throwIfError(
    existing.error,
    `Unable to look up N26 transaction ${providerTransactionId}`,
  );

  if (existing.data?.id) {
    const updated = await client
      .from("financial_transactions")
      .update(values)
      .eq("id", existing.data.id);
    throwIfError(
      updated.error,
      `Unable to update N26 transaction ${providerTransactionId}`,
    );
    await markRawTransaction(client, rawEvent.id, "processed");
    return { created: false, normalized: true };
  }

  const inserted = await client.from("financial_transactions").insert({
    financial_account_id: financialAccountId,
    external_transaction_id: providerTransactionId,
    ...values,
  });

  if (inserted.error && "code" in inserted.error && inserted.error.code === "23505") {
    const raced = await client
      .from("financial_transactions")
      .update(values)
      .eq("financial_account_id", financialAccountId)
      .eq("external_transaction_id", providerTransactionId);
    throwIfError(
      raced.error,
      `Unable to recover concurrent N26 transaction ${providerTransactionId}`,
    );
    await markRawTransaction(client, rawEvent.id, "processed");
    return { created: false, normalized: true };
  }

  throwIfError(
    inserted.error,
    `Unable to insert N26 transaction ${providerTransactionId}`,
  );
  await markRawTransaction(client, rawEvent.id, "processed");
  return { created: true, normalized: true };
}

async function markSyncRunFailed(
  client: AdminClient,
  syncRunId: string,
  errorCode: string,
): Promise<void> {
  await client
    .from("source_sync_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: errorCode.slice(0, 200),
    })
    .eq("id", syncRunId);
}

function utcDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function syncN26Session(
  userId: string,
  session: EnableBankingSession,
): Promise<FinanceSyncResult> {
  if (
    session.aspsp?.name.toLowerCase() !== "n26" ||
    session.aspsp?.country.toUpperCase() !== "DE"
  ) {
    throw new Error("The authorized bank session is not N26 Germany");
  }

  const client = createAdminClient();
  const dataSourceId = await upsertDataSource(client, userId, session);
  await grantFinanceConsent(
    client,
    userId,
    dataSourceId,
    session.access?.valid_until,
  );
  const syncRunId = await startSyncRun(client, userId, dataSourceId);

  let recordsCreated = 0;
  let recordsUpdated = 0;
  let transactionsSeen = 0;

  try {
    for (const authorizedAccount of session.accounts) {
      const account = await getEnableBankingAccountDetails(authorizedAccount.uid);
      const balances = await getEnableBankingAccountBalances(authorizedAccount.uid);
      const financialAccount = await syncFinancialAccount(
        client,
        userId,
        dataSourceId,
        account,
        balances,
      );

      if (financialAccount.created) {
        recordsCreated += 1;
      } else {
        recordsUpdated += 1;
      }

      let continuationKey: string | undefined;
      let pageCount = 0;

      do {
        const page = await getEnableBankingAccountTransactions(
          authorizedAccount.uid,
          {
            dateFrom: utcDateDaysAgo(90),
            dateTo: new Date().toISOString().slice(0, 10),
            ...(continuationKey ? { continuationKey } : {}),
          },
        );

        for (const transaction of page.transactions ?? []) {
          transactionsSeen += 1;
          const result = await syncFinancialTransaction(
            client,
            userId,
            dataSourceId,
            financialAccount.id,
            authorizedAccount.uid,
            transaction,
          );

          if (!result.normalized) {
            continue;
          }

          if (result.created) {
            recordsCreated += 1;
          } else {
            recordsUpdated += 1;
          }
        }

        continuationKey = page.continuation_key || undefined;
        pageCount += 1;

        if (pageCount >= 50) {
          throw new Error("N26 transaction pagination exceeded safety limit");
        }
      } while (continuationKey);
    }

    const finishedAt = new Date().toISOString();
    const completed = await client
      .from("source_sync_runs")
      .update({
        status: "completed",
        finished_at: finishedAt,
        cursor_after: null,
        records_seen: session.accounts.length + transactionsSeen,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        error_code: null,
      })
      .eq("id", syncRunId);

    throwIfError(completed.error, "Unable to finish N26 sync run");

    const sourceUpdated = await client
      .from("data_sources")
      .update({ last_sync_at: finishedAt })
      .eq("id", dataSourceId);

    throwIfError(sourceUpdated.error, "Unable to update N26 sync timestamp");

    return {
      provider: "enable-banking",
      institution: "n26",
      dataSourceId,
      syncRunId,
      accountsSeen: session.accounts.length,
      transactionsSeen,
      recordsCreated,
      recordsUpdated,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown_n26_sync_error";
    await markSyncRunFailed(client, syncRunId, message);
    throw error;
  }
}
