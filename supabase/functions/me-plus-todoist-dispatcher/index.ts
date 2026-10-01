import { withSupabase } from "npm:@supabase/server@^1";

const MAX_DISPATCHES_PER_WAKE = 5;

type TodoistFailure = Error & { status?: number; retryable?: boolean; details?: unknown };

function safeError(error: unknown) {
  const e = error as TodoistFailure;
  return {
    error_type: e?.name || "todoist_dispatch_error",
    message: String(e?.message ?? error).slice(0, 1200),
    http_status: e?.status ?? null,
    details: e?.details ?? null
  };
}

function isRetryable(error: unknown) {
  const e = error as TodoistFailure;
  if (typeof e?.retryable === "boolean") return e.retryable;
  if (typeof e?.status === "number") return e.status === 429 || e.status >= 500;
  return true;
}

async function deterministicUuid(seed: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

async function todoistRequest(token: string, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const err = new Error(`Todoist API ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`) as TodoistFailure;
    err.name = "todoist_api_error";
    err.status = res.status;
    err.retryable = res.status === 429 || res.status >= 500;
    err.details = typeof body === "object" ? body : null;
    throw err;
  }
  return body;
}

async function resolveProjectId(token: string, baseUrl: string, projectName: string) {
  const search = await todoistRequest(token, `${baseUrl}/projects/search?query=${encodeURIComponent(projectName)}&limit=50`);
  const results = Array.isArray(search?.results) ? search.results : [];
  const exact = results.find((p: any) => String(p?.name ?? "").toLocaleLowerCase() === projectName.toLocaleLowerCase());
  if (exact?.id) return String(exact.id);

  const all = await todoistRequest(token, `${baseUrl}/projects?limit=200`);
  const projects = Array.isArray(all?.results) ? all.results : Array.isArray(all) ? all : [];
  const fallback = projects.find((p: any) => String(p?.name ?? "").toLocaleLowerCase() === projectName.toLocaleLowerCase());
  if (fallback?.id) return String(fallback.id);

  const err = new Error(`Todoist project not found: ${projectName}`) as TodoistFailure;
  err.name = "todoist_project_not_found";
  err.retryable = false;
  throw err;
}

async function reconcileTodoistCompletions(admin: any, token: string, baseUrl: string, userId: string, projectId: string) {
  const { data: claim, error: claimError } = await admin.rpc("claim_todoist_completion_sync", {
    p_user_id: userId,
    p_project_id: projectId
  });
  if (claimError) throw new Error(`todoist_completion_claim_failed: ${claimError.message}`);
  if (claim?.claimed !== true) {
    return { status: "skipped", reason: String(claim?.reason ?? "not_claimed"), seen: 0, applied: 0, ignored: 0 };
  }

  const since = String(claim.since);
  const until = String(claim.until);
  let cursor: string | null = null;
  let pages = 0;
  let seen = 0;
  let applied = 0;
  let ignored = 0;
  let maxCompletedAt: string | null = null;

  try {
    do {
      const url = new URL(`${baseUrl}/tasks/completed/by_completion_date`);
      url.searchParams.set("since", since);
      url.searchParams.set("until", until);
      url.searchParams.set("project_id", projectId);
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);

      const page = await todoistRequest(token, url.toString());
      const items = Array.isArray(page?.items) ? page.items : [];
      seen += items.length;

      for (const item of items) {
        const taskId = String(item?.id ?? "").trim();
        const completedAtRaw = String(item?.completed_at ?? "").trim();
        if (!taskId || !completedAtRaw) {
          ignored += 1;
          continue;
        }

        const completedMs = Date.parse(completedAtRaw);
        if (!Number.isFinite(completedMs)) {
          ignored += 1;
          continue;
        }
        const completedAt = new Date(completedMs).toISOString();
        if (!maxCompletedAt || completedMs > Date.parse(maxCompletedAt)) maxCompletedAt = completedAt;

        const { data: outcome, error: reconcileError } = await admin.rpc("scheduler_reconcile_todoist_completion", {
          p_user_id: userId,
          p_todoist_task_id: taskId,
          p_completed_at: completedAt
        });
        if (reconcileError) throw new Error(`todoist_completion_writeback_failed: ${reconcileError.message}`);

        const status = String(outcome?.status ?? "");
        if (status === "completed" || status === "already_completed") applied += 1;
        else ignored += 1;
      }

      cursor = page?.next_cursor ? String(page.next_cursor) : null;
      pages += 1;
      if (cursor && pages >= 20) {
        const err = new Error("Todoist completion pagination exceeded 20 pages") as TodoistFailure;
        err.name = "todoist_completion_pagination_limit";
        err.retryable = true;
        throw err;
      }
    } while (cursor);

    const { error: finishError } = await admin.rpc("finish_todoist_completion_sync", {
      p_user_id: userId,
      p_scan_until: until,
      p_max_completed_at: maxCompletedAt,
      p_seen_count: seen,
      p_applied_count: applied,
      p_ignored_count: ignored
    });
    if (finishError) throw new Error(`todoist_completion_finish_failed: ${finishError.message}`);

    return { status: "completed", since, until, pages, seen, applied, ignored, max_completed_at: maxCompletedAt };
  } catch (error) {
    const safe = safeError(error);
    const failed = await admin.rpc("fail_todoist_completion_sync", {
      p_user_id: userId,
      p_error: safe
    });
    if (failed.error) console.error("todoist completion sync failure write failed", failed.error);
    throw error;
  }
}


async function listAllProjectTasks(token: string, baseUrl: string, projectId: string) {
  const tasks: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const url = new URL(`${baseUrl}/tasks`);
    url.searchParams.set("project_id", projectId);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await todoistRequest(token, url.toString());
    const rows = Array.isArray(page?.results) ? page.results : Array.isArray(page) ? page : [];
    tasks.push(...rows);
    cursor = page?.next_cursor ? String(page.next_cursor) : null;
    pages += 1;
    if (cursor && pages >= 20) {
      const err = new Error("Todoist active-task pagination exceeded 20 pages") as TodoistFailure;
      err.name = "todoist_catalog_pagination_limit";
      err.retryable = true;
      throw err;
    }
  } while (cursor);
  return tasks;
}

async function listCompletedProjectTasks(token: string, baseUrl: string, projectId: string, since: string, until: string) {
  const tasks: any[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const url = new URL(`${baseUrl}/tasks/completed/by_completion_date`);
    url.searchParams.set("since", since);
    url.searchParams.set("until", until);
    url.searchParams.set("project_id", projectId);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await todoistRequest(token, url.toString());
    const rows = Array.isArray(page?.items) ? page.items : [];
    tasks.push(...rows);
    cursor = page?.next_cursor ? String(page.next_cursor) : null;
    pages += 1;
    if (cursor && pages >= 20) {
      const err = new Error("Todoist completed-task pagination exceeded 20 pages") as TodoistFailure;
      err.name = "todoist_catalog_completed_pagination_limit";
      err.retryable = true;
      throw err;
    }
  } while (cursor);
  return tasks;
}

async function reopenTask(token: string, baseUrl: string, taskId: string) {
  await todoistRequest(token, `${baseUrl}/tasks/${encodeURIComponent(taskId)}/reopen`, { method: "POST" });
}

async function reconcileTodoistCatalog(admin: any, token: string, baseUrl: string, userId: string) {
  const { data: claim, error: claimError } = await admin.rpc("claim_todoist_catalog_refresh", { p_user_id: userId });
  if (claimError) throw new Error(`todoist_catalog_claim_failed: ${claimError.message}`);
  if (claim?.claimed !== true) {
    return { status: "skipped", reason: "no_catalog_refresh_signal", signal_count: 0 };
  }

  const signalIds = Array.isArray(claim?.signal_ids) ? claim.signal_ids.map((x: any) => String(x)) : [];
  try {
    const { data: state, error: stateError } = await admin.rpc("get_todoist_catalog_reconciliation_state", { p_user_id: userId });
    if (stateError) throw new Error(`todoist_catalog_state_read_failed: ${stateError.message}`);

    const projectId = String(state?.project_id ?? "").trim();
    const tasksSectionId = String(state?.tasks_section_id ?? "").trim();
    const routinesSectionId = String(state?.routines_section_id ?? "").trim();
    if (!projectId || !tasksSectionId || !routinesSectionId) {
      const err = new Error("Todoist Catalog project/section configuration is incomplete") as TodoistFailure;
      err.name = "todoist_catalog_config_missing";
      err.retryable = false;
      throw err;
    }

    const nowMs = Date.now();
    const lastSyncMs = Date.parse(String(state?.last_sync_at ?? ""));
    const fallbackSinceMs = nowMs - 24 * 60 * 60 * 1000;
    const maxLookbackMs = nowMs - 89 * 24 * 60 * 60 * 1000;
    const sinceMs = Number.isFinite(lastSyncMs)
      ? Math.max(maxLookbackMs, lastSyncMs - 10 * 60 * 1000)
      : fallbackSinceMs;
    const since = new Date(sinceMs).toISOString();
    const until = new Date(nowMs + 60 * 1000).toISOString();

    const [activeTasks, completedTasks] = await Promise.all([
      listAllProjectTasks(token, baseUrl, projectId),
      listCompletedProjectTasks(token, baseUrl, projectId, since, until)
    ]);

    const mappings = Array.isArray(state?.mappings) ? state.mappings : [];
    const activeById = new Map(activeTasks.map((t: any) => [String(t?.id ?? ""), t]));
    const completedById = new Map(completedTasks.map((t: any) => [String(t?.id ?? ""), t]));
    const mappingByTaskId = new Map(mappings.map((m: any) => [String(m?.todoist_task_id ?? ""), m]));

    let createdActions = 0;
    let createdRoutines = 0;
    let renamed = 0;
    let deleted = 0;
    let reopened = 0;
    let ignoredUnclassified = 0;

    for (const mapping of mappings) {
      const taskId = String(mapping?.todoist_task_id ?? "").trim();
      if (!taskId || activeById.has(taskId)) continue;

      if (completedById.has(taskId)) {
        try {
          await reopenTask(token, baseUrl, taskId);
          reopened += 1;
          continue;
        } catch (error) {
          const e = error as TodoistFailure;
          if (e.status !== 404) throw error;
        }
      }

      const { data: outcome, error: deleteError } = await admin.rpc("catalog_delete_entity", {
        p_user_id: userId,
        p_todoist_task_id: taskId
      });
      if (deleteError) throw new Error(`todoist_catalog_delete_writeback_failed: ${deleteError.message}`);
      if (String(outcome?.status ?? "") === "deleted") deleted += 1;
    }

    for (const task of activeTasks) {
      const taskId = String(task?.id ?? "").trim();
      const title = String(task?.content ?? "").trim();
      const sectionId = String(task?.section_id ?? "").trim();
      if (!taskId || !title) continue;

      const mapping = mappingByTaskId.get(taskId);
      if (!mapping) {
        if (sectionId === tasksSectionId) {
          const { data: outcome, error } = await admin.rpc("catalog_create_action_from_todoist", {
            p_user_id: userId,
            p_title: title,
            p_todoist_task_id: taskId,
            p_project_id: projectId,
            p_section_id: sectionId
          });
          if (error) throw new Error(`todoist_catalog_action_create_failed: ${error.message}`);
          if (String(outcome?.status ?? "") === "created") createdActions += 1;
        } else if (sectionId === routinesSectionId) {
          const { data: outcome, error } = await admin.rpc("catalog_create_routine_from_todoist", {
            p_user_id: userId,
            p_title: title,
            p_todoist_task_id: taskId,
            p_project_id: projectId,
            p_section_id: sectionId
          });
          if (error) throw new Error(`todoist_catalog_routine_create_failed: ${error.message}`);
          if (String(outcome?.status ?? "") === "created") createdRoutines += 1;
        } else {
          ignoredUnclassified += 1;
        }
        continue;
      }

      const entityType = String(mapping?.entity_type ?? "");
      const expectedSection = entityType === "routine" ? routinesSectionId : entityType === "action" ? tasksSectionId : "";
      if (!expectedSection || sectionId !== expectedSection) {
        const err = new Error(`Todoist Catalog item moved across semantic sections: ${taskId}`) as TodoistFailure;
        err.name = "todoist_catalog_section_semantic_conflict";
        err.retryable = false;
        err.details = { task_id: taskId, entity_type: entityType, observed_section_id: sectionId, expected_section_id: expectedSection };
        throw err;
      }

      if (title !== String(mapping?.last_synced_title ?? "")) {
        const { data: outcome, error } = await admin.rpc("catalog_rename_entity", {
          p_user_id: userId,
          p_todoist_task_id: taskId,
          p_new_title: title
        });
        if (error) throw new Error(`todoist_catalog_rename_failed: ${error.message}`);
        if (String(outcome?.status ?? "") === "renamed") renamed += 1;
      }
    }

    const verifyTasks = await listAllProjectTasks(token, baseUrl, projectId);
    const { data: verifyState, error: verifyStateError } = await admin.rpc("get_todoist_catalog_reconciliation_state", { p_user_id: userId });
    if (verifyStateError) throw new Error(`todoist_catalog_verify_state_failed: ${verifyStateError.message}`);

    const verifyMappings = Array.isArray(verifyState?.mappings) ? verifyState.mappings : [];
    const verifyTaskById = new Map(verifyTasks.map((t: any) => [String(t?.id ?? ""), t]));
    const verifyMappingById = new Map(verifyMappings.map((m: any) => [String(m?.todoist_task_id ?? ""), m]));

    const missingExternal: string[] = [];
    const titleMismatch: string[] = [];
    for (const m of verifyMappings) {
      const taskId = String(m?.todoist_task_id ?? "");
      const task = verifyTaskById.get(taskId);
      if (!task) {
        missingExternal.push(taskId);
        continue;
      }
      if (String(task?.content ?? "") !== String(m?.last_synced_title ?? "")) titleMismatch.push(taskId);
    }

    const missingMappings: string[] = [];
    for (const task of verifyTasks) {
      const sectionId = String(task?.section_id ?? "");
      if (sectionId !== tasksSectionId && sectionId !== routinesSectionId) continue;
      const taskId = String(task?.id ?? "");
      if (!verifyMappingById.has(taskId)) missingMappings.push(taskId);
    }

    if (missingExternal.length || titleMismatch.length || missingMappings.length) {
      const err = new Error("Todoist Catalog verification mismatch after reconciliation") as TodoistFailure;
      err.name = "todoist_catalog_verification_failed";
      err.retryable = true;
      err.details = {
        missing_external_task_ids: missingExternal.slice(0, 20),
        title_mismatch_task_ids: titleMismatch.slice(0, 20),
        missing_mapping_task_ids: missingMappings.slice(0, 20)
      };
      throw err;
    }

    const syncedAt = new Date().toISOString();
    const result = {
      project_id: projectId,
      signal_count: Number(claim?.signal_count ?? signalIds.length),
      active_task_count: verifyTasks.length,
      active_mapping_count: verifyMappings.length,
      created_actions: createdActions,
      created_routines: createdRoutines,
      renamed,
      deleted,
      reopened,
      ignored_unclassified: ignoredUnclassified,
      since,
      until
    };

    const { error: finishError } = await admin.rpc("finish_todoist_catalog_refresh", {
      p_user_id: userId,
      p_signal_ids: signalIds,
      p_synced_at: syncedAt,
      p_result: result
    });
    if (finishError) throw new Error(`todoist_catalog_finish_failed: ${finishError.message}`);

    return { status: "completed", ...result, synced_at: syncedAt };
  } catch (error) {
    const safe = safeError(error);
    const failed = await admin.rpc("fail_todoist_catalog_refresh", {
      p_user_id: userId,
      p_signal_ids: signalIds,
      p_error: safe
    });
    if (failed.error) console.error("catalog refresh failure write failed", failed.error);
    throw error;
  }
}

function routineParentKey(bundleKey: string, occurrenceDate: string) {
  return `${bundleKey}|${occurrenceDate}`;
}

function routineParentDescription(bundleKey: string, occurrenceDate: string) {
  return [
    "Me+ routine container",
    `Bundle key: ${bundleKey}`,
    `Occurrence: ${occurrenceDate}`,
    "This header groups only the child tasks that are currently applicable. Me+ may add or remove children as necessity changes."
  ].join("\n");
}

function readRoutineParentKey(task: any) {
  const description = String(task?.description ?? "");
  const bundleMatch = description.match(/(?:^|\\n)Bundle key: ([^\\n]+)/);
  const occurrenceMatch = description.match(/(?:^|\\n)Occurrence: ([^\\n]+)/);
  if (!description.includes("Me+ routine container") || !bundleMatch || !occurrenceMatch) return null;
  return routineParentKey(bundleMatch[1].trim(), occurrenceMatch[1].trim());
}

async function createRoutineParentIdempotently(
  token: string,
  baseUrl: string,
  projectId: string,
  userId: string,
  bundleKey: string,
  parentTitle: string,
  occurrenceDate: string,
  dueAt: string | null,
  knownTasks: any[]
) {
  const key = routineParentKey(bundleKey, occurrenceDate);
  const existing = knownTasks.find((t: any) => readRoutineParentKey(t) === key);
  if (existing?.id) return String(existing.id);

  const parentGeneration = String(Date.now());
  const commandUuid = await deterministicUuid(`meplus:todoist:routine-parent:${userId}:${bundleKey}:${occurrenceDate}:${parentGeneration}`);
  const tempId = await deterministicUuid(`meplus:todoist:routine-parent-temp:${userId}:${bundleKey}:${occurrenceDate}:${parentGeneration}`);
  const args: Record<string, unknown> = {
    content: `* ${parentTitle}`,
    description: routineParentDescription(bundleKey, occurrenceDate),
    project_id: projectId
  };
  if (dueAt) args.due = { date: dueAt };

  const commands = [{ type: "item_add", uuid: commandUuid, temp_id: tempId, args }];
  const form = new URLSearchParams();
  form.set("commands", JSON.stringify(commands));
  const sync = await todoistRequest(token, `${baseUrl}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  const status = sync?.sync_status?.[commandUuid];
  if (status !== "ok") {
    const err = new Error(`Todoist routine-parent create failed: ${JSON.stringify(status)}`) as TodoistFailure;
    err.name = "todoist_routine_parent_create_failed";
    err.retryable = false;
    err.details = status;
    throw err;
  }

  let taskId = sync?.temp_id_mapping?.[tempId] ? String(sync.temp_id_mapping[tempId]) : null;
  if (!taskId) {
    const refreshed = await listAllProjectTasks(token, baseUrl, projectId);
    const match = refreshed.find((t: any) => readRoutineParentKey(t) === key);
    taskId = match?.id ? String(match.id) : null;
  }
  if (!taskId) {
    const err = new Error("Todoist routine-parent create succeeded but task id could not be reconciled") as TodoistFailure;
    err.name = "todoist_routine_parent_mapping_missing";
    err.retryable = true;
    throw err;
  }
  return taskId;
}

async function createTaskIdempotently(token: string, baseUrl: string, projectId: string, action: any, parentTaskId: string | null = null) {
  const commandUuid = await deterministicUuid(`meplus:todoist:create:${action.action_id}`);
  const tempId = await deterministicUuid(`meplus:todoist:temp:${action.action_id}`);
  const args: Record<string, unknown> = {
    content: String(action.title),
    project_id: projectId
  };
  if (action.description) args.description = String(action.description);
  if (action.due_at) args.due = { date: String(action.due_at) };
  if (parentTaskId) args.parent_id = parentTaskId;
  if (Number.isFinite(Number(action?.bundle_child_order))) args.child_order = Number(action.bundle_child_order);

  const commands = [{ type: "item_add", uuid: commandUuid, temp_id: tempId, args }];
  const form = new URLSearchParams();
  form.set("commands", JSON.stringify(commands));
  const sync = await todoistRequest(token, `${baseUrl}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  const status = sync?.sync_status?.[commandUuid];
  if (status !== "ok") {
    const err = new Error(`Todoist create command failed: ${JSON.stringify(status)}`) as TodoistFailure;
    err.name = "todoist_sync_command_failed";
    err.retryable = false;
    err.details = status;
    throw err;
  }

  let taskId = sync?.temp_id_mapping?.[tempId] ? String(sync.temp_id_mapping[tempId]) : null;
  if (!taskId) {
    const page = await todoistRequest(token, `${baseUrl}/tasks?project_id=${encodeURIComponent(projectId)}&limit=200`);
    const tasks = Array.isArray(page?.results) ? page.results : Array.isArray(page) ? page : [];
    const match = tasks.find((t: any) =>
      String(t?.content ?? "") === String(action.title) &&
      (!parentTaskId || String(t?.parent_id ?? "") === parentTaskId)
    );
    taskId = match?.id ? String(match.id) : null;
  }
  if (!taskId) {
    const err = new Error("Todoist idempotent create succeeded but task id could not be reconciled") as TodoistFailure;
    err.name = "todoist_create_mapping_missing";
    err.retryable = true;
    throw err;
  }
  return taskId;
}

async function moveTaskToParent(token: string, baseUrl: string, taskId: string, parentTaskId: string) {
  await todoistRequest(token, `${baseUrl}/tasks/${encodeURIComponent(taskId)}/move`, {
    method: "POST",
    body: JSON.stringify({ parent_id: parentTaskId })
  });
}

async function updateTask(token: string, baseUrl: string, taskId: string, action: any, parentTaskId: string | null = null) {
  const body: Record<string, unknown> = { content: String(action.title) };
  if (action.description) body.description = String(action.description);
  if (action.due_at) body.due_datetime = String(action.due_at);
  await todoistRequest(token, `${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (parentTaskId && String(action?.todoist_parent_task_id ?? "") !== parentTaskId) {
    await moveTaskToParent(token, baseUrl, taskId, parentTaskId);
  }
}

async function cleanupEmptyRoutineParents(token: string, baseUrl: string, projectId: string) {
  const active = await listAllProjectTasks(token, baseUrl, projectId);
  const childParentIds = new Set(
    active.map((t: any) => String(t?.parent_id ?? "")).filter((x: string) => x.length > 0)
  );
  const removed: string[] = [];
  for (const task of active) {
    const taskId = String(task?.id ?? "");
    if (!taskId || !readRoutineParentKey(task) || childParentIds.has(taskId)) continue;
    await removeTask(token, baseUrl, taskId);
    removed.push(taskId);
  }
  return removed;
}

async function removeTask(token: string, baseUrl: string, taskId: string) {
  try {
    await todoistRequest(token, `${baseUrl}/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  } catch (error) {
    const e = error as TodoistFailure;
    if (e.status === 404) return;
    throw error;
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req: Request, ctx: any) => {
    if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

    const admin = ctx.supabaseAdmin;
    const wakeSecret = req.headers.get("x-meplus-wake-secret");
    const { data: authorized, error: authError } = await admin.rpc("todoist_dispatcher_wake_authorized", { p_secret: wakeSecret });
    if (authError || authorized !== true) {
      return Response.json({ error: "unauthorized_wake" }, { status: 401 });
    }

    await admin.rpc("recover_stale_todoist_dispatches");
    await admin.rpc("record_todoist_dispatcher_wake", { p_status: "invoked", p_error: null });

    const { data: config, error: configError } = await admin.rpc("get_todoist_dispatcher_config");
    if (configError) {
      const error = { error_type: "todoist_config_read_failed", message: configError.message };
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: error });
      return Response.json({ error: "config_read_failed" }, { status: 500 });
    }

    const envTokenEntry = Object.entries(Deno.env.toObject()).find(([key]) => key.toLowerCase() === "todoist_api_token");
    const envToken = String(envTokenEntry?.[1] ?? "").trim();
    const vaultToken = String(config?.api_token ?? "").trim();
    const token = envToken || vaultToken;
    const baseUrl = String(config?.api_base_url ?? "https://api.todoist.com/api/v1").replace(/\/$/, "");
    const projectName = String(config?.project_name ?? "Me+ Tasks");
    const userId = String(config?.user_id ?? "").trim();
    if (!token) {
      const error = { error_type: "todoist_api_token_missing", message: "Todoist API token is not configured in Edge Function secrets or Vault." };
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: error });
      return Response.json({ error: "todoist_api_token_missing" }, { status: 503 });
    }
    if (!userId) {
      const error = { error_type: "todoist_user_config_missing", message: "Todoist dispatcher user_id is missing from the active scheduler policy." };
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: error });
      return Response.json({ error: "todoist_user_config_missing" }, { status: 503 });
    }

    let projectId = String(config?.project_id ?? "").trim();
    try {
      if (!projectId) projectId = await resolveProjectId(token, baseUrl, projectName);
    } catch (error) {
      const safe = safeError(error);
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: safe });
      return Response.json({ error: safe.error_type }, { status: 502 });
    }

    let completionSync: any;
    try {
      completionSync = await reconcileTodoistCompletions(admin, token, baseUrl, userId, projectId);
    } catch (error) {
      const first = error as TodoistFailure;
      if (first.status === 404 && String(config?.project_id ?? "").trim()) {
        try {
          projectId = await resolveProjectId(token, baseUrl, projectName);
          completionSync = await reconcileTodoistCompletions(admin, token, baseUrl, userId, projectId);
        } catch (retryError) {
          const safe = safeError(retryError);
          await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: safe });
          return Response.json({ error: safe.error_type, phase: "completion_sync" }, { status: 502 });
        }
      } else {
        const safe = safeError(error);
        await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: safe });
        return Response.json({ error: safe.error_type, phase: "completion_sync" }, { status: 502 });
      }
    }

    let catalogSync: any = { status: "skipped", reason: "not_checked" };
    try {
      catalogSync = await reconcileTodoistCatalog(admin, token, baseUrl, userId);
    } catch (error) {
      const safe = safeError(error);
      catalogSync = { status: "failed", error: safe };
      console.error("Todoist Catalog reconciliation failed", safe);
    }

    const results: any[] = [];
    for (let i = 0; i < MAX_DISPATCHES_PER_WAKE; i++) {
      const { data: dispatch, error: claimError } = await admin.rpc("claim_todoist_scheduler_dispatch");
      if (claimError) {
        const safe = { error_type: "todoist_claim_failed", message: claimError.message };
        await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: safe });
        return Response.json({ error: "claim_failed", results }, { status: 500 });
      }
      if (!dispatch) break;

      const dispatchId = String(dispatch.id);
      try {
        const { data: actions, error: actionsError } = await admin.rpc("get_todoist_dispatch_actions", { p_dispatch_id: dispatchId });
        if (actionsError) throw new Error(`todoist_action_batch_failed: ${actionsError.message}`);

        const actionRows = Array.isArray(actions) ? actions : [];
        const processed: any[] = [];
        const projectTasks = actionRows.some((a: any) => a?.bundle_key)
          ? await listAllProjectTasks(token, baseUrl, projectId)
          : [];
        const parentCache = new Map<string, string>();
        for (const task of projectTasks) {
          const key = readRoutineParentKey(task);
          if (key && task?.id) parentCache.set(key, String(task.id));
        }

        for (const action of actionRows) {
          const operation = String(action?.operation ?? "noop");
          if (operation === "noop") continue;

          let parentTaskId: string | null = null;
          const bundleKey = String(action?.bundle_key ?? "").trim();
          const parentTitle = String(action?.bundle_parent_title ?? "").trim();
          const occurrenceDate = String(action?.bundle_occurrence_date ?? "").trim();
          if (operation !== "remove" && bundleKey && parentTitle && occurrenceDate) {
            const key = routineParentKey(bundleKey, occurrenceDate);
            parentTaskId = parentCache.get(key) ?? null;
            if (!parentTaskId) {
              parentTaskId = await createRoutineParentIdempotently(
                token, baseUrl, projectId, userId, bundleKey, parentTitle, occurrenceDate,
                action?.due_at ? String(action.due_at) : null, projectTasks
              );
              parentCache.set(key, parentTaskId);
              projectTasks.push({
                id: parentTaskId,
                content: `* ${parentTitle}`,
                description: routineParentDescription(bundleKey, occurrenceDate)
              });
            }
          }

          if (operation === "create") {
            const taskId = await createTaskIdempotently(token, baseUrl, projectId, action, parentTaskId);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result_v2", {
              p_action_id: action.action_id,
              p_operation: "create",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId,
              p_todoist_parent_task_id: parentTaskId
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({
              action_id: action.action_id, operation: "create", todoist_task_id: taskId,
              todoist_parent_task_id: parentTaskId, bundle_key: bundleKey || null
            });
          } else if (operation === "update") {
            const taskId = String(action.todoist_task_id ?? "");
            if (!taskId) throw new Error(`update_missing_todoist_task_id:${action.action_id}`);
            await updateTask(token, baseUrl, taskId, action, parentTaskId);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result_v2", {
              p_action_id: action.action_id,
              p_operation: "update",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId,
              p_todoist_parent_task_id: parentTaskId
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({
              action_id: action.action_id, operation: "update", todoist_task_id: taskId,
              todoist_parent_task_id: parentTaskId, bundle_key: bundleKey || null
            });
          } else if (operation === "remove") {
            const taskId = String(action.todoist_task_id ?? "");
            if (!taskId) continue;
            await removeTask(token, baseUrl, taskId);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result_v2", {
              p_action_id: action.action_id,
              p_operation: "remove",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId,
              p_todoist_parent_task_id: null
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({ action_id: action.action_id, operation: "remove", todoist_task_id: taskId });
          }
        }

        const removedEmptyRoutineParents = await cleanupEmptyRoutineParents(token, baseUrl, projectId);
        const terminalStatus = processed.length > 0 || removedEmptyRoutineParents.length > 0 ? "completed" : "not_required";
        const result = {
          project_id: projectId,
          project_name: projectName,
          operations: processed,
          removed_empty_routine_parent_ids: removedEmptyRoutineParents
        };
        const { error: finishError } = await admin.rpc("finish_todoist_scheduler_dispatch", {
          p_dispatch_id: dispatchId,
          p_status: terminalStatus,
          p_result: result
        });
        if (finishError) throw new Error(`todoist_finish_failed: ${finishError.message}`);
        results.push({ dispatch_id: dispatchId, status: terminalStatus, operations: processed.length });
      } catch (error) {
        const safe = safeError(error);
        const retryable = isRetryable(error);
        await admin.rpc("fail_todoist_scheduler_dispatch", {
          p_dispatch_id: dispatchId,
          p_error: safe,
          p_retryable: retryable
        });
        results.push({ dispatch_id: dispatchId, status: retryable ? "retry" : "blocked", error: safe.error_type });
        if (!retryable) break;
      }
    }

    await admin.rpc("record_todoist_dispatcher_wake", { p_status: "completed", p_error: null });
    return Response.json({ ok: true, project_id: projectId, completion_sync: completionSync, catalog_sync: catalogSync, results });
  })
};
