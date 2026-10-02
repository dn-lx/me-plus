export default async function handler() {
  const secret = Netlify.env.get("N26_SYNC_SCHEDULER_SECRET");
  const siteUrl = Netlify.env.get("URL");

  if (!secret || !siteUrl) {
    throw new Error("Missing recurring N26 scheduler configuration");
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

  if (response.status !== 202) {
    throw new Error(`Unable to start N26 background sync (${response.status})`);
  }
}

export const config = {
  // Netlify schedules are UTC. Six-hour refreshes keep the stored account state
  // well inside Me+'s 36-hour freshness threshold without excessive provider traffic.
  schedule: "15 */6 * * *",
};
