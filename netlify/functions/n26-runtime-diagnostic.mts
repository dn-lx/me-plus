import { timingSafeEqual } from "node:crypto";

const VARIABLE_NAMES = [
  "N26_SYNC_SCHEDULER_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ENABLE_BANKING_APPLICATION_ID",
  "ENABLE_BANKING_PRIVATE_KEY",
  "ENABLE_BANKING_REDIRECT_URL",
] as const;

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function authorized(request: Request, expected: string): boolean {
  const actual = request.headers.get("x-me-plus-scheduler-secret");
  if (!actual) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const schedulerSecret = Netlify.env.get("N26_SYNC_SCHEDULER_SECRET");
  if (!schedulerSecret) {
    return Response.json(
      { ok: false, error: "scheduler_secret_unavailable" },
      { status: 503 },
    );
  }

  if (!authorized(request, schedulerSecret)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const variables = VARIABLE_NAMES.map((name) => {
    const netlifyEnvPresent = hasText(Netlify.env.get(name));
    const workerAccessorPresent =
      name === "N26_SYNC_SCHEDULER_SECRET"
        ? netlifyEnvPresent
        : hasText(process.env[name]);

    return {
      name,
      workerAccessorPresent,
      netlifyEnvPresent,
    };
  });

  return Response.json({
    ok: true,
    allWorkerAccessorsPresent: variables.every(
      (item) => item.workerAccessorPresent,
    ),
    allNetlifyEnvPresent: variables.every((item) => item.netlifyEnvPresent),
    variables,
  });
}
