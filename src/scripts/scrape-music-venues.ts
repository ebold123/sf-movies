import { join } from "node:path";
import { writeTheaterEvents } from "../shared/events/persist";
import { recordScraperStatus, STATUS_DIR_NAME } from "../shared/scraperStatus";
import { fetchEventsFor } from "../shared/scrapers/fetchEvents";
import { musicVenues } from "../shared/theaters";
import type { TheaterConfig } from "../shared/theaters";

const DATA_DIR = join(process.cwd(), "movie-data");
const STATUS_DIR = join(DATA_DIR, STATUS_DIR_NAME);

async function scrapeOne(theater: TheaterConfig): Promise<void> {
  const events = await fetchEventsFor(theater);
  console.log(`Fetched ${events.length} upcoming events for ${theater.name}`);

  const changedFiles = await writeTheaterEvents(DATA_DIR, theater.slug, events);
  console.log(
    changedFiles.length > 0
      ? `Updated: ${changedFiles.join(", ")}`
      : `No changes for ${theater.name} — data already up to date`,
  );

  await recordScraperStatus(STATUS_DIR, theater, events);
}

// One action scrapes every music venue in turn. A single venue's failure is
// logged and reflected in the exit code, but doesn't stop the rest from
// scraping — so the workflow can still commit whatever did succeed.
async function main() {
  const venues = musicVenues();
  let failures = 0;

  for (const theater of venues) {
    try {
      await scrapeOne(theater);
    } catch (error) {
      failures++;
      console.error(`Failed to scrape ${theater.name}:`, error);
    }
  }

  if (failures > 0) {
    console.error(`${failures} of ${venues.length} music venues failed to scrape`);
    process.exitCode = 1;
  }
}

main();
