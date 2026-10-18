import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type FolderConfig = { key: string; id: string; name: string };
type DriveFile = { id: string; name: string; mimeType?: string; modifiedTime?: string; size?: string; md5Checksum?: string };
type Reading = {
  metric: string;
  externalId: string;
  revisionKey?: string;
  observedAt: string;
  intervalStart?: string | null;
  intervalEnd?: string | null;
  sourceModifiedAt: string;
  sourceFileId: string;
  sourceFileName: string;
  unit?: string | null;
  valueNumber?: number | null;
  valueText?: string | null;
  sourcePayload: Record<string, unknown>;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const TIME_ZONE = "Europe/Berlin";
const LOCAL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit"
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function slug(value: string) {
  return normalizeHeader(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") {
        row.push(field.replace(/\r$/, "")); field = "";
        if (row.some((x) => x.trim() !== "")) rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function localPartsAt(timestampMs: number, timeZone: string) {
  const formatter = timeZone === TIME_ZONE ? LOCAL_FORMATTER : new Intl.DateTimeFormat("en-GB", {
    timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const parts = formatter.formatToParts(new Date(timestampMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute"), s: get("second") };
}

function zonedToIso(y: number, m: number, d: number, h: number, min: number, s: number, timeZone = TIME_ZONE) {
  const desired = Date.UTC(y, m - 1, d, h, min, s);
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const p = localPartsAt(guess, timeZone);
    const represented = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += desired - represented;
  }
  return new Date(guess).toISOString();
}

function parseLocalDateTime(dateRaw?: string, timeRaw?: string): string | null {
  const d = (dateRaw ?? "").trim();
  const t = (timeRaw ?? "").trim();
  if (!d && !t) return null;
  const combined = /\d{1,2}:\d{2}/.test(d) ? d : `${d} ${t || "00:00:00"}`;
  const m = combined.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return zonedToIso(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function metricFor(folderKey: string, headerRaw: string): { metric: string; unit: string | null } | null {
  const h = normalizeHeader(headerRaw);
  if (!h || h === "date" || h === "time" || h === "datetime" || h.includes("start time") || h.includes("end time") || h === "start" || h === "end") return null;

  if (h.includes("heart rate")) return { metric: "heart-rate", unit: "bpm" };
  if (h === "steps" || h.includes("step count")) return { metric: "steps", unit: "count" };
  if (h.includes("respiration") || h.includes("respiratory rate")) return { metric: "respiration-rate", unit: "breaths/min" };
  if (h.includes("oxygen saturation") || h === "spo2" || h.includes("blood oxygen")) return { metric: "oxygen-saturation", unit: "%" };

  if (h === "active calories" || h.includes("active calories")) return { metric: "active-calories-burned", unit: "kcal" };
  if (h === "resting calories" || h.includes("resting calories")) return { metric: "resting-calories-burned", unit: "kcal" };
  if (h === "total calories" || h.includes("total calories")) return { metric: "total-calories-burned", unit: "kcal" };

  const weightMap: Record<string, [string, string | null]> = {
    "weight": ["weight", "kg"],
    "body fat percentage": ["body-fat-percentage", "%"],
    "body fat mass": ["body-fat-mass", "kg"],
    "fat free percentage": ["fat-free-percentage", "%"],
    "fat free mass": ["fat-free-mass", "kg"],
    "skeletal muscle percentage": ["skeletal-muscle-percentage", "%"],
    "skeletal muscle mass": ["skeletal-muscle-mass", "kg"],
    "muscle mass percentage": ["muscle-mass-percentage", "%"],
    "muscle mass": ["muscle-mass", "kg"],
    "bone mass": ["bone-mass", "kg"],
    "base metabolic rate": ["basal-metabolic-rate", "kcal/day"]
  };
  if (weightMap[h]) return { metric: weightMap[h][0], unit: weightMap[h][1] };

  if (folderKey === "sleep") {
    if (h.includes("sleep stage")) return { metric: "sleep-stage", unit: null };
    if (h.includes("duration") || h.includes("sleep time")) return { metric: "sleep-" + slug(h), unit: null };
    if (h.includes("deep") || h.includes("light") || h.includes("rem") || h.includes("awake")) return { metric: "sleep-" + slug(h), unit: null };
  }

  return { metric: `healthsync.${folderKey}.${slug(h)}`, unit: null };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rowObject(headers: string[], values: string[]) {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => out[h] = values[i] ?? "");
  return out;
}

function findValue(headers: string[], values: string[], matcher: (h: string) => boolean) {
  const index = headers.findIndex((h) => matcher(normalizeHeader(h)));
  return index >= 0 ? (values[index] ?? "") : "";
}

async function readingsFromCsv(
  folder: FolderConfig,
  file: DriveFile,
  csv: string,
  chunkStartMs: number,
  chunkEndMs: number
): Promise<{ readings: Reading[]; rowCount: number; maxObservedAt: string | null }> {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { readings: [], rowCount: Math.max(rows.length - 1, 0), maxObservedAt: null };
  const headers = rows[0].map((x) => x.replace(/^\uFEFF/, "").trim());
  const readings: Reading[] = [];
  let maxObservedAt: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    const dateRaw = findValue(headers, values, (h) => h === "date" || h === "datetime");
    const timeRaw = findValue(headers, values, (h) => h === "time");
    const startRaw = findValue(headers, values, (h) => h.includes("start time") || h === "start");
    const endRaw = findValue(headers, values, (h) => h.includes("end time") || h === "end");

    const intervalStart = parseLocalDateTime(startRaw || dateRaw, startRaw ? "" : timeRaw);
    const intervalEnd = parseLocalDateTime(endRaw, "");
    const observedAt = intervalStart ?? parseLocalDateTime(dateRaw, timeRaw);
    if (!observedAt) continue;
    if (!maxObservedAt || observedAt > maxObservedAt) maxObservedAt = observedAt;

    const observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs)) continue;
    // Reconcile every valid row in a changed Health Sync file. Health Sync can
    // append or backfill observations after their original two-hour window.
    // Stable external IDs plus revision hashes make full-file reconciliation
    // idempotent in server_ingest_healthsync_batch_v2.

    const sourceRow = rowObject(headers, values);
    for (let c = 0; c < headers.length; c++) {
      const raw = (values[c] ?? "").trim();
      if (!raw) continue;
      const mapping = metricFor(folder.key, headers[c]);
      if (!mapping) continue;

      const valueNumber = parseNumber(raw);
      const valueText = valueNumber === null ? raw : null;
      const externalId = [
        "healthsync", mapping.metric, observedAt,
        intervalStart ?? "", intervalEnd ?? ""
      ].join(":");

      const base = {
        metric: mapping.metric,
        externalId,
        observedAt,
        intervalStart,
        intervalEnd,
        sourceModifiedAt: file.modifiedTime ?? new Date().toISOString(),
        sourceFileId: file.id,
        sourceFileName: file.name,
        unit: mapping.unit,
        valueNumber,
        valueText,
        sourcePayload: {
          row: sourceRow,
          folderKey: folder.key,
          folderId: folder.id,
          folderName: folder.name,
          sourceHeader: headers[c],
          sourceValue: raw,
          timezone: TIME_ZONE
        }
      };
      readings.push(base as Reading);
    }
  }
  return { readings, rowCount: rows.length - 1, maxObservedAt };
}

async function getGoogleAccessToken() {
  const clientId = Deno.env.get("GOOGLE_HEALTHSYNC_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_HEALTHSYNC_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_HEALTHSYNC_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) return { token: null, error: "drive_auth_unconfigured" };

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    let googleError = "unknown";
    let googleDescription = "";
    try {
      const err = await res.json();
      googleError = String(err?.error ?? "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
      googleDescription = String(err?.error_description ?? "").replace(/[\r\n]+/g, " ").slice(0, 240);
    } catch {}
    const diagnostic = googleDescription
      ? `drive_token_refresh_${res.status}:${googleError}:${googleDescription}`
      : `drive_token_refresh_${res.status}:${googleError}`;
    return { token: null, error: diagnostic };
  }
  const data = await res.json();
  return { token: data.access_token as string, error: null };
}

async function listFolderFiles(token: string, folderId: string, modifiedAfter?: string | null): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken = "";
  const clauses = [`'${folderId}' in parents`, "trashed=false"];
  if (modifiedAfter) clauses.push(`modifiedTime > '${modifiedAfter}'`);
  do {
    const params = new URLSearchParams({
      q: clauses.join(" and "),
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size,md5Checksum)",
      pageSize: "200",
      orderBy: "modifiedTime desc"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`drive_list_${res.status}`);
    const data = await res.json();
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return all;
}

async function downloadFile(token: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`drive_download_${res.status}`);
  return await res.text();
}

function floor2hMs(valueMs: number) {
  const ms = 2 * 60 * 60 * 1000;
  return Math.floor(valueMs / ms) * ms;
}

function resolveTwoHourChunk(body: Record<string, unknown>) {
  const explicitStart = typeof body?.chunkStart === "string" ? Date.parse(body.chunkStart) : NaN;
  const explicitEnd = typeof body?.chunkEnd === "string" ? Date.parse(body.chunkEnd) : NaN;
  if (Number.isFinite(explicitStart) && Number.isFinite(explicitEnd) && explicitEnd > explicitStart) {
    const boundedEnd = Math.min(explicitEnd, explicitStart + 2 * 60 * 60 * 1000);
    return { startMs: explicitStart, endMs: boundedEnd };
  }
  const endMs = floor2hMs(Date.now());
  return { startMs: endMs - 2 * 60 * 60 * 1000, endMs };
}

function runKeyForChunk(startMs: number) {
  return `healthsync_drive:v2:${new Date(startMs).toISOString().slice(0,16)}Z`;
}

const HEALTHSYNC_BATCH_SIZE = 100;
const HEALTHSYNC_MIN_SPLIT_SIZE = 20;

function healthsyncStatementTimeout(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  return code === "57014" || /statement timeout|canceling statement due to statement timeout/i.test(message);
}

async function ingestHealthsyncBatchAdaptive(
  supabase: any,
  userId: string,
  runId: string,
  batch: any[]
): Promise<void> {
  const { error } = await supabase.rpc("server_ingest_healthsync_batch_v2", {
    p_user_id: userId,
    p_sync_run_id: runId,
    p_readings: batch
  });
  if (!error) return;

  if (healthsyncStatementTimeout(error) && batch.length > HEALTHSYNC_MIN_SPLIT_SIZE) {
    const mid = Math.ceil(batch.length / 2);
    console.warn(JSON.stringify({
      event: "healthsync_batch_timeout_split",
      batchSize: batch.length,
      leftSize: mid,
      rightSize: batch.length - mid
    }));
    await ingestHealthsyncBatchAdaptive(supabase, userId, runId, batch.slice(0, mid));
    await ingestHealthsyncBatchAdaptive(supabase, userId, runId, batch.slice(mid));
    return;
  }

  throw new Error(`ingest_batch:${error.message}`);
}

async function ingestHealthsyncReadingsAdaptive(
  supabase: any,
  userId: string,
  runId: string,
  readings: any[]
): Promise<void> {
  for (let i = 0; i < readings.length; i += HEALTHSYNC_BATCH_SIZE) {
    await ingestHealthsyncBatchAdaptive(
      supabase,
      userId,
      runId,
      readings.slice(i, i + HEALTHSYNC_BATCH_SIZE)
    );
  }
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "supabase_runtime_unconfigured" }, 500);
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const wakeSecret = req.headers.get("x-meplus-healthsync-wake-secret") ?? "";
  const { data: valid, error: authError } = await supabase.rpc("server_validate_healthsync_wake", { p_secret: wakeSecret });
  if (authError || valid !== true) return json({ error: "unauthorized" }, 401);

  const requestBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const chunk = resolveTwoHourChunk(requestBody as Record<string, unknown>);
  const chunkStart = new Date(chunk.startMs).toISOString();
  const chunkEnd = new Date(chunk.endMs).toISOString();
  const requestedRunKey = typeof requestBody?.runKey === "string" && requestBody.runKey.trim()
    ? requestBody.runKey.trim().slice(0, 180)
    : runKeyForChunk(chunk.startMs);

  const google = await getGoogleAccessToken();
  if (!google.token) {
    await supabase.from("data_sources")
      .update({ metadata: { authConfigured: false, lastAuthError: google.error, lastAuthCheckedAt: new Date().toISOString() } })
      .eq("provider", "google-drive-healthsync");
    return json({
      status: "failed",
      error: "healthsync_drive_auth_failed",
      configured: false
    }, 502);
  }

  const { data: sources, error: sourcesError } = await supabase.from("data_sources")
    .select("id,user_id,metadata,last_sync_at")
    .eq("provider", "google-drive-healthsync")
    .eq("status", "active");
  if (sourcesError) return json({ error: "source_lookup_failed", detail: sourcesError.message }, 500);

  const results: unknown[] = [];
  for (const source of sources ?? []) {
    const folders = ((source.metadata as any)?.folders ?? []) as FolderConfig[];
    const { data: begin, error: beginError } = await supabase.rpc("server_begin_healthsync_run", {
      p_user_id: source.user_id,
      p_run_key: requestedRunKey,
      p_metadata: {
        requestedBy: "me-plus-healthsync-drive",
        folderCount: folders.length,
        chunkStart,
        chunkEnd,
        chunkHours: 2
      }
    });
    if (beginError) {
      await supabase.rpc("record_scheduler_heartbeat", {
        p_user_id: source.user_id,
        p_scheduler_key: "healthsync_drive_ingestion",
        p_status: "failed",
        p_error: { error_code: "healthsync_begin_failed", message: beginError.message },
        p_expected_cadence_minutes: 30,
        p_allowed_lateness_minutes: 10,
        p_automation_id: "supabase:healthsync_drive_ingestion"
      });
      results.push({ userId: source.user_id, status: "begin_failed", error: beginError.message });
      continue;
    }
    if (begin?.status !== "started") {
      const beginStatus = String(begin?.status ?? "unknown");
      const heartbeatStatus = beginStatus === "already_completed"
        ? "no_op"
        : beginStatus === "already_running"
          ? "skipped_overlap"
          : "failed";
      await supabase.rpc("record_scheduler_heartbeat", {
        p_user_id: source.user_id,
        p_scheduler_key: "healthsync_drive_ingestion",
        p_status: heartbeatStatus,
        p_error: heartbeatStatus === "failed"
          ? { error_code: "healthsync_run_not_started", begin_status: beginStatus, sync_run_id: begin?.syncRunId ?? null }
          : null,
        p_expected_cadence_minutes: 30,
        p_allowed_lateness_minutes: 10,
        p_automation_id: "supabase:healthsync_drive_ingestion"
      });
      results.push({ userId: source.user_id, ...begin });
      continue;
    }

    const runId = begin.syncRunId as string;
    let filesScanned = 0, filesChanged = 0, csvProcessed = 0, rowsParsed = 0, readingsParsed = 0;
    const fileErrors: { folder: string; file?: string; error: string }[] = [];
    const modifiedAfter = new Date(chunk.startMs - 6 * 60 * 60 * 1000).toISOString();

    try {
      const { data: priorStates } = await supabase.from("healthsync_file_state")
        .select("file_id,provider_modified_at,provider_size_bytes,content_hash,processing_status,row_count,max_observed_at,metadata")
        .eq("data_source_id", source.id);
      const state = new Map((priorStates ?? []).map((x: any) => [x.file_id, x]));

      for (const folder of folders) {
        let files: DriveFile[] = [];
        try {
          files = await listFolderFiles(google.token, folder.id, modifiedAfter);
        } catch (e) {
          fileErrors.push({ folder: folder.name, error: String(e) });
          continue;
        }

        for (const file of files) {
          if (!file.name.toLowerCase().endsWith(".csv")) continue;
          filesScanned++;
          const old: any = state.get(file.id);
          const oldModifiedMs = old?.provider_modified_at
            ? Date.parse(String(old.provider_modified_at))
            : NaN;
          const fileModifiedMs = file.modifiedTime
            ? Date.parse(String(file.modifiedTime))
            : NaN;
          const unchangedFile = old &&
            old.processing_status === "processed" &&
            Number.isFinite(oldModifiedMs) &&
            Number.isFinite(fileModifiedMs) &&
            oldModifiedMs === fileModifiedMs &&
            String(old.provider_size_bytes ?? "") === String(file.size ?? "");
          if (unchangedFile) continue;

          filesChanged++;
          try {
            const csv = await downloadFile(google.token, file.id);
            const contentHash = await sha256Hex(csv);
            const parsed = await readingsFromCsv(folder, file, csv, chunk.startMs, chunk.endMs);
            rowsParsed += parsed.rowCount;
            readingsParsed += parsed.readings.length;

            await ingestHealthsyncReadingsAdaptive(
              supabase,
              source.user_id,
              runId,
              parsed.readings
            );

            const { error: fileStateError } = await supabase.rpc("server_record_healthsync_file", {
              p_user_id: source.user_id, p_sync_run_id: runId,
              p_file: {
                folderId: folder.id, folderName: folder.name, fileId: file.id, fileName: file.name,
                mimeType: file.mimeType, modifiedAt: file.modifiedTime, sizeBytes: file.size,
                contentHash, status: "processed", rowCount: parsed.rowCount,
                maxObservedAt: parsed.maxObservedAt,
                metadata: {
                  readingsParsed: parsed.readings.length,
                  chunkStart,
                  chunkEnd,
                  processedThrough: chunkEnd
                }
              }
            });
            if (fileStateError) throw new Error(`file_state:${fileStateError.message}`);
            csvProcessed++;
          } catch (e) {
            fileErrors.push({ folder: folder.name, file: file.name, error: String(e) });
            await supabase.rpc("server_record_healthsync_file", {
              p_user_id: source.user_id, p_sync_run_id: runId,
              p_file: {
                folderId: folder.id, folderName: folder.name, fileId: file.id, fileName: file.name,
                mimeType: file.mimeType, modifiedAt: file.modifiedTime, sizeBytes: file.size,
                status: "error", errorCode: String(e).slice(0, 300)
              }
            });
          }
        }
      }

      const terminalStatus = fileErrors.length > 0 ? "failed" : "completed";
      const { data: finished, error: finishError } = await supabase.rpc("server_finish_healthsync_run", {
        p_user_id: source.user_id,
        p_sync_run_id: runId,
        p_status: terminalStatus,
        p_cursor_after: new Date().toISOString(),
        p_error_code: terminalStatus === "failed" ? "healthsync_file_processing_failed" : null,
        p_metadata: {
          filesScanned, filesChanged, csvProcessed, rowsParsed, readingsParsed,
          modifiedAfter,
          chunkStart,
          chunkEnd,
          chunkHours: 2,
          fileErrorCount: fileErrors.length,
          fileErrors: fileErrors.slice(0, 20)
        }
      });
      if (finishError) throw new Error(`finish_run:${finishError.message}`);

      // Observability read-back: prove the persisted terminal business state, not only HTTP success.
      const { data: persistedRun, error: persistedRunError } = await supabase
        .from("source_sync_runs")
        .select("id,status,started_at,finished_at,error_code,records_seen,records_created,records_updated")
        .eq("id", runId)
        .maybeSingle();

      if (persistedRunError) {
        console.warn(JSON.stringify({
          event: "healthsync_terminal_readback_failed",
          syncRunId: runId,
          chunkStart,
          chunkEnd,
          message: persistedRunError.message
        }));
      } else {
        console.log(JSON.stringify({
          event: "healthsync_terminal",
          syncRunId: runId,
          status: persistedRun?.status ?? null,
          startedAt: persistedRun?.started_at ?? null,
          finishedAt: persistedRun?.finished_at ?? null,
          errorCode: persistedRun?.error_code ?? null,
          recordsSeen: persistedRun?.records_seen ?? null,
          recordsCreated: persistedRun?.records_created ?? null,
          recordsUpdated: persistedRun?.records_updated ?? null,
          chunkStart,
          chunkEnd,
          filesScanned,
          filesChanged,
          csvProcessed,
          rowsParsed,
          readingsParsed,
          fileErrorCount: fileErrors.length
        }));
      }

      const { data: sourceAfterFinish } = await supabase.from("data_sources")
        .select("metadata")
        .eq("id", source.id)
        .maybeSingle();
      await supabase.from("data_sources").update({
        metadata: {
          ...((sourceAfterFinish?.metadata as any) ?? (source.metadata as any) ?? {}),
          authConfigured: true,
          lastDriveCheckAt: new Date().toISOString(),
          lastFileErrorCount: fileErrors.length,
          lastHealthSyncChunkStart: chunkStart,
          lastHealthSyncChunkEnd: terminalStatus === "completed" ? chunkEnd : (source.metadata as any)?.lastHealthSyncChunkEnd ?? null
        }
      }).eq("id", source.id);

      results.push({
        userId: source.user_id,
        ...finished,
        chunkStart,
        chunkEnd,
        filesScanned,
        filesChanged,
        csvProcessed,
        rowsParsed,
        readingsParsed,
        fileErrors
      });
    } catch (e) {
      await supabase.rpc("server_finish_healthsync_run", {
        p_user_id: source.user_id,
        p_sync_run_id: runId,
        p_status: "failed",
        p_error_code: "healthsync_worker_exception",
        p_metadata: { error: String(e).slice(0, 1000), filesScanned, filesChanged, csvProcessed }
      });
      results.push({ userId: source.user_id, status: "failed", error: String(e) });
    }
  }

  return json({ status: "ok", results });
});
