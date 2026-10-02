import { authorizedSchedulerRequest } from "../lib/n26-scheduler-auth.mts";

const VARIABLE_NAMES = [
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

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!authorizedSchedulerRequest(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const variables = VARIABLE_NAMES.map((name) => ({
    name,
    workerAccessorPresent: hasText(process.env[name]),
    netlifyEnvPresent: hasText(Netlify.env.get(name)),
  }));

  return Response.json({
    ok: true,
    schedulerAuthentication: "supabase_vault_secret_sha256_verifier",
    allWorkerAccessorsPresent: variables.every(
      (item) => item.workerAccessorPresent,
    ),
    allNetlifyEnvPresent: variables.every((item) => item.netlifyEnvPresent),
    variables,
  });
}
