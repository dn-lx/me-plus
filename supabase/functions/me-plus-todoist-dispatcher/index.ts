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

async function createTaskIdempotently(token: string, baseUrl: string, projectId: string, action: any) {
  const commandUuid = await deterministicUuid(`meplus:todoist:create:${action.action_id}`);
  const tempId = await deterministicUuid(`meplus:todoist:temp:${action.action_id}`);
  const args: Record<string, unknown> = {
    content: String(action.title),
    project_id: projectId
  };
  if (action.description) args.description = String(action.description);
  if (action.due_at) args.due = { date: String(action.due_at) };

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
    const match = tasks.find((t: any) => String(t?.content ?? "") === String(action.title));
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

async function updateTask(token: string, baseUrl: string, taskId: string, action: any) {
  const body: Record<string, unknown> = { content: String(action.title) };
  if (action.description) body.description = String(action.description);
  if (action.due_at) body.due_datetime = String(action.due_at);
  await todoistRequest(token, `${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
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
    if (!token) {
      const error = { error_type: "todoist_api_token_missing", message: "Todoist API token is not configured in Edge Function secrets or Vault." };
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: error });
      return Response.json({ error: "todoist_api_token_missing" }, { status: 503 });
    }

    let projectId: string;
    try {
      projectId = await resolveProjectId(token, baseUrl, projectName);
    } catch (error) {
      const safe = safeError(error);
      await admin.rpc("record_todoist_dispatcher_wake", { p_status: "failed", p_error: safe });
      return Response.json({ error: safe.error_type }, { status: 502 });
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
        for (const action of actionRows) {
          const operation = String(action?.operation ?? "noop");
          if (operation === "noop") continue;

          if (operation === "create") {
            const taskId = await createTaskIdempotently(token, baseUrl, projectId, action);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result", {
              p_action_id: action.action_id,
              p_operation: "create",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({ action_id: action.action_id, operation: "create", todoist_task_id: taskId });
          } else if (operation === "update") {
            const taskId = String(action.todoist_task_id ?? "");
            if (!taskId) throw new Error(`update_missing_todoist_task_id:${action.action_id}`);
            await updateTask(token, baseUrl, taskId, action);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result", {
              p_action_id: action.action_id,
              p_operation: "update",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({ action_id: action.action_id, operation: "update", todoist_task_id: taskId });
          } else if (operation === "remove") {
            const taskId = String(action.todoist_task_id ?? "");
            if (!taskId) continue;
            await removeTask(token, baseUrl, taskId);
            const { error: markError } = await admin.rpc("scheduler_record_todoist_surface_result", {
              p_action_id: action.action_id,
              p_operation: "remove",
              p_todoist_task_id: taskId,
              p_todoist_project_id: projectId
            });
            if (markError) throw new Error(`canonical_surface_writeback_failed: ${markError.message}`);
            processed.push({ action_id: action.action_id, operation: "remove", todoist_task_id: taskId });
          }
        }

        const terminalStatus = processed.length > 0 ? "completed" : "not_required";
        const result = { project_id: projectId, project_name: projectName, operations: processed };
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
    return Response.json({ ok: true, project_id: projectId, results });
  })
};
