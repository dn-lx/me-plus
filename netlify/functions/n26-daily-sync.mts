export default async function handler() {
  const secret = Netlify.env.get("N26_SYNC_SCHEDULER_SECRET");
  const siteUrl = Netlify.env.get("URL");

  if (!secret || !siteUrl) {
    throw new Error("Missing N26 scheduler configuration");
  }

  const response = await fetch(
    new URL("/.netlify/functions/n26-sync-background", siteUrl),
    {
      method: "POST",
      headers: {
        "x-me-plus-scheduler-secret": secret,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to start N26 background sync (${response.status})`);
  }
}

export const config = {
  schedule: "0 5 * * *",
};
