import type { SensorReading } from "@me-plus/contracts";

export type HealthChangePage = {
  readings: SensorReading[];
  deletionCount: number;
  nextChangesToken: string;
  changesTokenExpired: boolean;
  hasMore: boolean;
};

export type HealthChangeDrainResult = {
  pagesRead: number;
  readingsUploaded: number;
  deletionChangesSeen: number;
  finalToken: string;
  expired: boolean;
};

export async function drainHealthChanges(options: {
  initialToken: string;
  readPage: (changesToken: string) => Promise<HealthChangePage>;
  uploadReadings: (readings: readonly SensorReading[]) => Promise<void>;
  saveToken: (changesToken: string) => Promise<void> | void;
  maxPages?: number;
}): Promise<HealthChangeDrainResult> {
  const maxPages = options.maxPages ?? 100;
  let token = options.initialToken;
  let pagesRead = 0;
  let readingsUploaded = 0;
  let deletionChangesSeen = 0;

  while (pagesRead < maxPages) {
    const page = await options.readPage(token);
    pagesRead += 1;

    if (page.changesTokenExpired) {
      return {
        pagesRead,
        readingsUploaded,
        deletionChangesSeen,
        finalToken: token,
        expired: true,
      };
    }

    if (!page.nextChangesToken) {
      throw new Error("Health Connect returned an empty changes token.");
    }

    if (page.readings.length > 0) {
      await options.uploadReadings(page.readings);
      readingsUploaded += page.readings.length;
    }

    deletionChangesSeen += page.deletionCount;

    if (page.hasMore && page.nextChangesToken === token) {
      throw new Error("Health Connect changes pagination did not advance.");
    }

    // Persist only after every upsert in this page has been acknowledged by Me+.
    // A crash before this point safely replays the page because server ingestion is idempotent.
    await options.saveToken(page.nextChangesToken);

    if (!page.hasMore) {
      return {
        pagesRead,
        readingsUploaded,
        deletionChangesSeen,
        finalToken: page.nextChangesToken,
        expired: false,
      };
    }

    token = page.nextChangesToken;
  }

  throw new Error(`Health Connect changes pagination exceeded ${maxPages} pages.`);
}
