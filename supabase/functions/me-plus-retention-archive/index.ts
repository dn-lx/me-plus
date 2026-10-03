import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const H = {"content-type":"application/json"};
const USER_ID = "459ab99b-d99d-492b-bb23-95144dbb1e47";
const SCHEDULER_KEY = "retention_archive_worker";
const POLICY_KEY = "meplus_data_retention";

const respond = (x: unknown, s=200) => new Response(JSON.stringify(x), {status:s, headers:H});
const enc = new TextEncoder();
const dec = new TextDecoder();

function hex(bytes: Uint8Array) {
  return [...bytes].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function sha256(bytes: Uint8Array) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function gzip(text: string) {
  const input = new Blob([enc.encode(text)]).stream();
  const compressed = input.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const input = new Blob([bytes]).stream();
  const decompressed = input.pipeThrough(new DecompressionStream("gzip"));
  return dec.decode(await new Response(decompressed).arrayBuffer());
}

function safeDatePath(d: Date) {
  return d.toISOString().slice(0,10).replaceAll("-","/");
}

async function ensurePrivateBucket(db:any, bucket:string) {
  const { data, error } = await db.storage.getBucket(bucket);
  if (!error && data) {
    if ((data as any).public === true) throw new Error("archive_bucket_is_public");
    return;
  }
  const { error: createError } = await db.storage.createBucket(bucket, { public:false });
  if (createError && !String(createError.message||"").toLowerCase().includes("already exists")) {
    throw new Error("archive_bucket_create_failed:"+createError.message);
  }
  const { data:check, error:checkError } = await db.storage.getBucket(bucket);
  if (checkError || !check || (check as any).public === true) throw new Error("archive_bucket_verification_failed");
}

async function uploadVerified(
  db:any,
  bucket:string,
  objectPath:string,
  manifestPath:string,
  ndjson:string,
  manifestBase:Record<string,unknown>
) {
  const compressed = await gzip(ndjson);
  const checksum = await sha256(compressed);
  const manifest = {
    ...manifestBase,
    checksum_sha256: checksum,
    compressed_bytes: compressed.byteLength,
    uncompressed_bytes: enc.encode(ndjson).byteLength
  };

  const { error: upError } = await db.storage.from(bucket).upload(
    objectPath,
    new Blob([compressed], {type:"application/gzip"}),
    {upsert:false, contentType:"application/gzip"}
  );
  if (upError) throw new Error("archive_upload_failed:"+upError.message);

  const { error: manError } = await db.storage.from(bucket).upload(
    manifestPath,
    new Blob([JSON.stringify(manifest,null,2)], {type:"application/json"}),
    {upsert:false, contentType:"application/json"}
  );
  if (manError) {
    await db.storage.from(bucket).remove([objectPath]);
    throw new Error("manifest_upload_failed:"+manError.message);
  }

  const { data:downloaded, error:downloadError } = await db.storage.from(bucket).download(objectPath);
  if (downloadError || !downloaded) throw new Error("archive_readback_failed:"+String(downloadError?.message||"missing_blob"));
  const readback = new Uint8Array(await downloaded.arrayBuffer());
  const readbackHash = await sha256(readback);
  if (readbackHash !== checksum) throw new Error("archive_checksum_mismatch");

  const restored = await gunzip(readback);
  const restoredLines = restored.length ? restored.trimEnd().split("\n") : [];
  for (const line of restoredLines) JSON.parse(line);
  const expectedRows = Number((manifestBase as any).row_count || 0);
  if (restoredLines.length !== expectedRows) throw new Error("archive_restore_row_count_mismatch");

  const { data:manifestBlob, error:manifestReadError } = await db.storage.from(bucket).download(manifestPath);
  if (manifestReadError || !manifestBlob) throw new Error("manifest_readback_failed");
  const manifestRead = JSON.parse(await manifestBlob.text());
  if (manifestRead.checksum_sha256 !== checksum || Number(manifestRead.row_count) !== expectedRows) {
    throw new Error("manifest_verification_failed");
  }

  return {checksum, compressedBytes:compressed.byteLength, uncompressedBytes:enc.encode(ndjson).byteLength};
}

async function heartbeat(db:any, status:string, error?:unknown) {
  await db.rpc("record_scheduler_heartbeat", {
    p_user_id: USER_ID,
    p_scheduler_key: SCHEDULER_KEY,
    p_status: status,
    p_error: error ? {error_code:"retention_archive_worker_failed", message:String(error).slice(0,600)} : null,
    p_expected_cadence_minutes: 360,
    p_allowed_lateness_minutes: 30,
    p_automation_id: "supabase:retention_archive_worker"
  });
}

async function selfTest(db:any, bucket:string, policyVersion:string) {
  const runId = crypto.randomUUID();
  const base = "_self-test/"+safeDatePath(new Date())+"/"+runId;
  const objectPath = base+".ndjson.gz";
  const manifestPath = base+".manifest.json";
  const rows = [
    {id:crypto.randomUUID(),kind:"retention-self-test",value:1},
    {id:crypto.randomUUID(),kind:"retention-self-test",value:2}
  ];
  const ndjson = rows.map(x=>JSON.stringify(x)).join("\n")+"\n";
  const verified = await uploadVerified(db,bucket,objectPath,manifestPath,ndjson,{
    schema_version:"1", mode:"self_test", policy_version:policyVersion, row_count:rows.length,
    created_at:new Date().toISOString()
  });
  const { error:removeError } = await db.storage.from(bucket).remove([objectPath,manifestPath]);
  if (removeError) throw new Error("self_test_cleanup_failed:"+removeError.message);
  return {status:"verified", rows:rows.length, ...verified};
}

async function expireColdArchives(db:any, bucket:string) {
  const { data, error } = await db.rpc("server_get_expired_retention_archives",{p_user_id:USER_ID,p_limit:20});
  if (error) throw new Error("expired_archive_lookup_failed:"+error.message);
  const expired = Array.isArray(data) ? data : [];
  const results:any[] = [];
  for (const run of expired) {
    const paths = [run.object_path,run.manifest_path].filter(Boolean);
    if (paths.length) {
      const { error:removeError } = await db.storage.from(bucket).remove(paths);
      if (removeError) throw new Error("archive_expiry_storage_delete_failed:"+removeError.message);
    }
    const { data:marked, error:markError } = await db.rpc("server_mark_retention_archive_expired",{
      p_user_id:USER_ID,p_run_id:run.id
    });
    if (markError) throw new Error("archive_expiry_mark_failed:"+markError.message);
    results.push(marked);
  }
  return results;
}

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !sr) return respond({error:"supabase_runtime_unconfigured"},500);
  const db = createClient(url,sr,{auth:{persistSession:false,autoRefreshToken:false}});

  const wake = req.headers.get("x-meplus-retention-wake-secret") || "";
  const { data:valid, error:authError } = await db.rpc("server_validate_retention_wake",{p_secret:wake});
  if (authError || valid !== true) return respond({error:"unauthorized"},401);

  let mode = "scheduled";
  try {
    const body = await req.json();
    if (body?.mode) mode = String(body.mode);
  } catch {}

  await heartbeat(db,"invoked");

  try {
    const { data:policy, error:policyError } = await db.rpc("server_get_retention_policy",{
      p_user_id:USER_ID,p_policy_key:POLICY_KEY
    });
    if (policyError || !policy) throw new Error("retention_policy_unavailable:"+String(policyError?.message||"missing"));

    const bucket = String(policy.archive_bucket || "meplus-archive");
    await ensurePrivateBucket(db,bucket);

    if (mode === "self_test") {
      const result = await selfTest(db,bucket,String(policy.policy_version));
      await heartbeat(db,"completed");
      return respond({status:"ok",mode,result});
    }

    const expired = await expireColdArchives(db,bucket);

    if (!policy.archive_enabled) {
      await heartbeat(db,"completed");
      return respond({status:"no_op",reason:"archive_disabled",expired_archives:expired.length});
    }

    const classes = policy.policy?.classes || {};
    const batchSize = Math.min(Math.max(Number(policy.policy?.batch_size || 5000),1),10000);
    const maxBatches = Math.min(Math.max(Number(policy.policy?.max_batches_per_class || 12),1),20);
    const summary:any[] = [];

    for (const dataClass of ["raw_event_revisions","raw_events","health_observation_evidence"]) {
      const cfg = classes[dataClass] || {};
      if (cfg.archive_enabled !== true) continue;
      const hotDays = Number(cfg.postgres_hot_days || 90);
      const totalDays = Number(cfg.archive_total_days || 365);
      const cutoff = new Date(Date.now() - hotDays*86400000);
      const archiveExpiresAt = new Date(cutoff.getTime() + totalDays*86400000);

      let classArchived = 0;
      let classDeleted = 0;
      let batches = 0;

      while (batches < maxBatches) {
        const { data:candidates, error:candidateError } = await db.rpc("server_get_retention_candidates",{
          p_user_id:USER_ID,p_data_class:dataClass,p_cutoff_at:cutoff.toISOString(),p_limit:batchSize
        });
        if (candidateError) throw new Error("candidate_lookup_failed:"+dataClass+":"+candidateError.message);
        const rows = Array.isArray(candidates?.rows) ? candidates.rows : [];
        if (!rows.length) break;

        const { data:started, error:startError } = await db.rpc("server_start_retention_archive_run",{
          p_user_id:USER_ID,p_policy_key:POLICY_KEY,p_policy_version:String(policy.policy_version),
          p_data_class:dataClass,p_mode:mode,p_cutoff_at:cutoff.toISOString(),
          p_archive_expires_at:archiveExpiresAt.toISOString(),
          p_metadata:{batch_size:rows.length,source:"retention_archive_worker"}
        });
        if (startError || !started?.id) throw new Error("archive_run_start_failed:"+String(startError?.message||"missing_id"));
        const runId = String(started.id);
        const base = USER_ID+"/"+dataClass+"/"+safeDatePath(new Date())+"/"+runId;
        const objectPath = base+".ndjson.gz";
        const manifestPath = base+".manifest.json";
        const ndjson = rows.map((x:any)=>JSON.stringify(x)).join("\n")+"\n";
        const ids = rows.map((x:any)=>String(x.id));

        try {
          const verified = await uploadVerified(db,bucket,objectPath,manifestPath,ndjson,{
            schema_version:"1",run_id:runId,user_id:USER_ID,data_class:dataClass,
            policy_key:POLICY_KEY,policy_version:String(policy.policy_version),
            cutoff_at:cutoff.toISOString(),archive_expires_at:archiveExpiresAt.toISOString(),
            row_count:rows.length,created_at:new Date().toISOString()
          });

          const { error:finishError } = await db.rpc("server_finish_retention_archive_run",{
            p_user_id:USER_ID,p_run_id:runId,p_status:"verified",p_row_count:rows.length,
            p_object_path:objectPath,p_manifest_path:manifestPath,p_checksum_sha256:verified.checksum,
            p_error_code:null,p_metadata:{
              compressed_bytes:verified.compressedBytes,uncompressed_bytes:verified.uncompressedBytes
            }
          });
          if (finishError) throw new Error("archive_run_finish_failed:"+finishError.message);

          const { error:indexError } = await db.rpc("server_register_retention_archive_index",{
            p_user_id:USER_ID,p_run_id:runId,p_record_ids:ids,p_expires_at:archiveExpiresAt.toISOString()
          });
          if (indexError) throw new Error("archive_index_register_failed:"+indexError.message);

          classArchived += rows.length;

          if (policy.delete_enabled === true && cfg.delete_after_verified_archive === true) {
            const { data:deleted, error:deleteError } = await db.rpc("server_delete_archived_rows",{
              p_user_id:USER_ID,p_run_id:runId,p_record_ids:ids
            });
            if (deleteError) throw new Error("archived_row_delete_failed:"+deleteError.message);
            classDeleted += Number(deleted?.deleted_count || 0);
          }
        } catch (e) {
          await db.rpc("server_finish_retention_archive_run",{
            p_user_id:USER_ID,p_run_id:runId,p_status:"failed",p_row_count:rows.length,
            p_object_path:objectPath,p_manifest_path:manifestPath,p_checksum_sha256:null,
            p_error_code:String(e).slice(0,400),p_metadata:{}
          });
          throw e;
        }

        batches++;
        if (rows.length < batchSize) break;
      }

      summary.push({data_class:dataClass,archived:classArchived,deleted:classDeleted,batches});
    }

    await heartbeat(db,"completed");
    return respond({
      status:"ok",mode,policy_version:policy.policy_version,delete_enabled:policy.delete_enabled,
      expired_archives:expired.length,summary
    });
  } catch (e) {
    await heartbeat(db,"failed",e);
    return respond({status:"failed",error:String(e).slice(0,700)},500);
  }
});