declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function berlinTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default async (req: Request) => {
  // Netlify cron is UTC. Running at both candidate UTC hours and gating by
  // Europe/Berlin preserves 07:30 local across DST transitions so the
  // provider refresh can finish before the 08:00 daily bank briefing.
  if (berlinTime(new Date()) !== "07:30") {
    return;
  }

  const token = Netlify.env.get("MEPLUS_SCHEDULER_INTERNAL_TOKEN");
  const siteUrl = Netlify.env.get("URL");

  if (!token || !siteUrl) {
    throw new Error("Missing scheduled N26 refresh runtime configuration");
  }

  const response = await fetch(
    new URL("/.netlify/functions/n26-provider-refresh-background", siteUrl),
    {
      method: "POST",
      headers: {
        "x-meplus-scheduler-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        trigger: "netlify-scheduled",
        scheduledAt: new Date().toISOString(),
      }),
    },
  );

  if (response.status !== 202) {
    throw new Error(
      `Unable to enqueue N26 provider refresh background function: ${response.status}`,
    );
  }
};

export const config = {
  schedule: "30 5,6 * * *",
};
