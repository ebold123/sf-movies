import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Event } from "./events/event";
import { recordScraperStatus } from "./scraperStatus";
import type { TheaterConfig } from "./theaters";

const balboa: TheaterConfig = {
  slug: "balboa",
  name: "Balboa",
  baseUrl: "https://www.balboamovies.com",
  source: "cinema-sf",
};

function sampleOurEvent(overrides: Partial<Event> = {}): Event {
  return {
    theater: "Balboa",
    title: "The Tale of Zatoichi",
    startTime: "2026-08-30T14:30:00-07:00",
    sourceUrl: "https://www.balboamovies.com/calendar-of-events/the-tale-of-zatoichi-august-30",
    ...overrides,
  };
}

// A SceneF listings response agreeing exactly with sampleOurEvent().
function sampleListings() {
  return {
    films: [{ key: "tmdb-16692", title: "The Tale of Zatoichi" }],
    screenings: [
      {
        id: "ce9ec0a9ff39",
        filmKey: "tmdb-16692",
        startsAt: "2026-08-30T14:30:00-07:00",
        ticketUrl: "https://scenef.com/go/ce9ec0a9ff39",
      },
    ],
  };
}

// A "now" before the sample showing, so it isn't excluded as past.
const NOW = new Date("2026-08-01T12:00:00-07:00");

function fetchReturning(body: unknown) {
  return async () => ({ json: async () => body }) as Response;
}

let statusDir: string;

beforeEach(async () => {
  statusDir = await mkdtemp(join(tmpdir(), "sf-movies-status-"));
});

afterEach(async () => {
  await rm(statusDir, { recursive: true, force: true });
});

async function readBlock(slug: string) {
  return JSON.parse(await readFile(join(statusDir, `${slug}.json`), "utf-8"));
}

describe("recordScraperStatus", () => {
  it("writes an ok block when SceneF confirms every showing", async () => {
    await recordScraperStatus(statusDir, balboa, [sampleOurEvent()], fetchReturning(sampleListings()), NOW);

    expect(await readBlock("balboa")).toEqual({
      slug: "balboa",
      theater: "Balboa",
      generatedAt: expect.any(String),
      status: "ok",
      report: {
        matched: 1,
        timeMismatches: [],
        titleMismatches: [],
        oursOnly: [],
        scenefOnly: [],
        collapsedDuplicates: 0,
        excluded: { ours: 0, scenef: 0 },
      },
    });
  });

  it("marks the block discrepancies when any comparison class is non-empty", async () => {
    // SceneF has a 5 PM showing we don't — the collapsed-showtime signature.
    const listings = sampleListings();
    listings.screenings.push({
      id: "ef195d1f20d0",
      filmKey: "tmdb-16692",
      startsAt: "2026-08-30T17:00:00-07:00",
      ticketUrl: "https://scenef.com/go/ef195d1f20d0",
    });

    await recordScraperStatus(statusDir, balboa, [sampleOurEvent()], fetchReturning(listings), NOW);

    const block = await readBlock("balboa");
    expect(block.status).toBe("discrepancies");
    expect(block.report.scenefOnly).toEqual([
      { title: "The Tale of Zatoichi", startTime: "2026-08-30T17:00:00-07:00" },
    ]);
  });

  it("absorbs a SceneF failure into an unavailable block instead of throwing", async () => {
    const failingFetch = async () => {
      throw new Error("SceneF request timed out");
    };

    await recordScraperStatus(statusDir, balboa, [sampleOurEvent()], failingFetch, NOW);

    expect(await readBlock("balboa")).toEqual({
      slug: "balboa",
      theater: "Balboa",
      generatedAt: expect.any(String),
      status: "unavailable",
      error: "SceneF request timed out",
    });
  });

  it("writes no block for a theater whose showtime source is SceneF itself", async () => {
    const alamo: TheaterConfig = {
      slug: "alamo",
      name: "Alamo",
      baseUrl: "https://drafthouse.com/sf",
      source: "scenef",
      venueId: "alamo-new-mission",
    };

    await recordScraperStatus(statusDir, alamo, [sampleOurEvent()], fetchReturning(sampleListings()), NOW);

    await expect(readBlock("alamo")).rejects.toThrow(/ENOENT/);
  });
});
