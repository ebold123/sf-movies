import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Event } from "./event";
import { loadAllEvents } from "./loadEvents";

const sampleEvent: Event = {
  theater: "Bottom of the Hill",
  title: "The Fake Names",
  startTime: "2026-08-30T20:00:00-07:00",
  sourceUrl: "https://bottomofthehill.com/calendar/the-fake-names-august-30",
};

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "sf-movies-load-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("loadAllEvents", () => {
  it("loads month files but ignores the scraper-status directory", async () => {
    await mkdir(join(dataDir, "2026", "bottom-of-the-hill"), { recursive: true });
    await writeFile(
      join(dataDir, "2026", "bottom-of-the-hill", "08.json"),
      JSON.stringify([sampleEvent]),
    );

    // Status blocks share movie-data (so the scrape workflows commit them)
    // but are not events and must never reach the site.
    await mkdir(join(dataDir, "scraper-status"), { recursive: true });
    await writeFile(
      join(dataDir, "scraper-status", "bottom-of-the-hill.json"),
      JSON.stringify({ slug: "bottom-of-the-hill", status: "ok" }),
    );

    expect(await loadAllEvents(dataDir)).toEqual([sampleEvent]);
  });

  it("ignores movie theater directories — this fork only displays music venues", async () => {
    await mkdir(join(dataDir, "2026", "balboa"), { recursive: true });
    await writeFile(join(dataDir, "2026", "balboa", "08.json"), JSON.stringify([sampleEvent]));

    expect(await loadAllEvents(dataDir)).toEqual([]);
  });
});
