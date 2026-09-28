import { describe, expect, it } from "vitest";
import type { Event } from "./events/event";
import type { SceneFListingsResponse, SceneFScreening } from "./scrapers/scenef";
import { compareWithSceneF } from "./scenefCompare";

// Real captured shapes (Balboa / SceneF, Aug 2026). Tests tweak only the
// fields that matter to the case at hand.
function sampleOurEvent(overrides: Partial<Event> = {}): Event {
  return {
    theater: "Balboa",
    title: "The Tale of Zatoichi",
    startTime: "2026-08-30T14:30:00-07:00",
    sourceUrl: "https://www.balboamovies.com/calendar-of-events/the-tale-of-zatoichi-august-30",
    ...overrides,
  };
}

function sampleScreening(overrides: Partial<SceneFScreening> = {}): SceneFScreening {
  return {
    id: "ce9ec0a9ff39",
    filmKey: "tmdb-16692",
    startsAt: "2026-08-30T14:30:00-07:00",
    ticketUrl: "https://scenef.com/go/ce9ec0a9ff39",
    ...overrides,
  };
}

function sampleListings(overrides: Partial<SceneFListingsResponse> = {}): SceneFListingsResponse {
  return {
    films: [{ key: "tmdb-16692", title: "The Tale of Zatoichi" }],
    screenings: [sampleScreening()],
    ...overrides,
  };
}

// A "now" before every sample showing, so none are excluded as past.
const NOW = new Date("2026-08-01T12:00:00-07:00");

// SceneF reads the Cinema SF venues from two places and titles them
// differently, publishing some screenings twice. These fixtures are the real
// Sep 11 Balboa instant.
const VEEZI = "veezi:sessions";
const CALENDAR = "www.balboamovies.com/calendar-of-events";

describe("SceneF duplicate screenings", () => {
  it("counts a screening SceneF published twice from two sources only once", () => {
    const ours = [
      sampleOurEvent({
        title: "TWIN PEAKS FEST: Season 1, Ep. 1 (Northwest Passage)",
        startTime: "2026-09-11T18:00:00-07:00",
      }),
    ];
    const scenef = sampleListings({
      films: [
        { key: "t-twin-peaks-season-1-ep-1", title: "Twin Peaks: SEASON 1, EP. 1 (Northwest Passage)" },
        {
          key: "t-twin-peaks-fest-season-1-ep-1",
          title: "TWIN PEAKS FEST: Season 1, Ep. 1 (Northwest Passage)",
        },
      ],
      screenings: [
        sampleScreening({
          id: "2d9ade9b9195",
          filmKey: "t-twin-peaks-season-1-ep-1",
          startsAt: "2026-09-11T18:00:00-07:00",
          sources: [VEEZI],
        }),
        sampleScreening({
          id: "029ff348cbb7",
          filmKey: "t-twin-peaks-fest-season-1-ep-1",
          startsAt: "2026-09-11T18:00:00-07:00",
          sources: [CALENDAR],
        }),
      ],
    });

    expect(compareWithSceneF(ours, scenef, NOW)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 1,
      excluded: { ours: 0, scenef: 0 },
    });
  });

  it("keeps two different films at one instant when they share a source", () => {
    // The Balboa really does start both at 4:30 PM on Sep 7, on two screens.
    const scenef = sampleListings({
      films: [
        { key: "tmdb-149", title: "Akira" },
        { key: "t-cocoon", title: "cocoon – One Summer of Girlhood (Eng Sub)" },
      ],
      screenings: [
        sampleScreening({
          filmKey: "tmdb-149",
          startsAt: "2026-09-07T16:30:00-07:00",
          sources: [VEEZI],
        }),
        sampleScreening({
          id: "other",
          filmKey: "t-cocoon",
          startsAt: "2026-09-07T16:30:00-07:00",
          sources: [VEEZI],
        }),
      ],
    });

    const report = compareWithSceneF(
      [sampleOurEvent({ title: "Akira", startTime: "2026-09-07T16:30:00-07:00" })],
      scenef,
      NOW,
    );

    expect(report.collapsedDuplicates).toBe(0);
    expect(report.matched).toBe(1);
    expect(report.scenefOnly).toEqual([
      { title: "cocoon – One Summer of Girlhood (Eng Sub)", startTime: "2026-09-07T16:30:00-07:00" },
    ]);
  });

  it("collapses a cross-source pair that carries the identical title", () => {
    const scenef = sampleListings({
      films: [{ key: "t-stardust", title: "The Legend of the Stardust Brothers" }],
      screenings: [
        sampleScreening({
          filmKey: "t-stardust",
          startsAt: "2026-09-15T19:30:00-07:00",
          sources: [VEEZI],
        }),
        sampleScreening({
          id: "other",
          filmKey: "t-stardust",
          startsAt: "2026-09-15T19:30:00-07:00",
          sources: [CALENDAR],
        }),
      ],
    });

    const report = compareWithSceneF(
      [
        sampleOurEvent({
          title: "The Legend of the Stardust Brothers",
          startTime: "2026-09-15T19:30:00-07:00",
        }),
      ],
      scenef,
      NOW,
    );

    expect(report.collapsedDuplicates).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.scenefOnly).toEqual([]);
  });
});

describe("compareWithSceneF", () => {
  it("counts a showing with the same start instant and title as matched", () => {
    expect(compareWithSceneF([sampleOurEvent()], sampleListings(), NOW)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 0, scenef: 0 },
    });
  });

  it("treats titles as compatible when one contains the other, ignoring case and punctuation", () => {
    // The venue annotates ("Akira 4K"); SceneF uses the canonical film title.
    const ours = [sampleOurEvent({ title: "Akira 4K" })];
    const scenef = sampleListings({ films: [{ key: "tmdb-16692", title: "Akira" }] });

    expect(compareWithSceneF(ours, scenef, NOW).matched).toBe(1);
  });

  it("reports showings only SceneF has — the collapsed-Balboa-day case", () => {
    // Our scraper collapsed "2:30 PM, 5 PM & 7:30 PM" to one 2:30 event;
    // SceneF (correctly) has three screenings that day.
    const ours = [sampleOurEvent()];
    const scenef = sampleListings({
      screenings: [
        sampleScreening(),
        sampleScreening({ id: "ef195d1f20d0", startsAt: "2026-08-30T17:00:00-07:00" }),
        sampleScreening({ id: "ec3b814ef6b2", startsAt: "2026-08-30T19:30:00-07:00" }),
      ],
    });

    expect(compareWithSceneF(ours, scenef, NOW)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [
        { title: "The Tale of Zatoichi", startTime: "2026-08-30T17:00:00-07:00" },
        { title: "The Tale of Zatoichi", startTime: "2026-08-30T19:30:00-07:00" },
      ],
      collapsedDuplicates: 0,
      excluded: { ours: 0, scenef: 0 },
    });
  });

  it("excludes our showings beyond SceneF's horizon instead of reporting them", () => {
    // Squarespace lists events months out; SceneF's window is shorter. A
    // showing past SceneF's last day is unverifiable, not a discrepancy.
    const ours = [
      sampleOurEvent(),
      sampleOurEvent({ title: "Basic Instinct", startTime: "2026-09-15T19:00:00-07:00" }),
    ];

    expect(compareWithSceneF(ours, sampleListings(), NOW)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 1, scenef: 0 },
    });
  });

  it("reports the same film a few minutes apart as time mismatch, with both times", () => {
    const ours = [sampleOurEvent({ startTime: "2026-08-30T14:35:00-07:00" })];

    expect(compareWithSceneF(ours, sampleListings(), NOW)).toEqual({
      matched: 0,
      timeMismatches: [
        {
          title: "The Tale of Zatoichi",
          ourStartTime: "2026-08-30T14:35:00-07:00",
          scenefStartTime: "2026-08-30T14:30:00-07:00",
        },
      ],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 0, scenef: 0 },
    });
  });

  it("reports different films at the same instant as a title mismatch", () => {
    const ours = [sampleOurEvent({ title: "Basic Instinct" })];

    expect(compareWithSceneF(ours, sampleListings(), NOW)).toEqual({
      matched: 0,
      timeMismatches: [],
      titleMismatches: [
        {
          startTime: "2026-08-30T14:30:00-07:00",
          ourTitle: "Basic Instinct",
          scenefTitle: "The Tale of Zatoichi",
        },
      ],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 0, scenef: 0 },
    });
  });

  it("excludes showings from before today in Pacific time", () => {
    // 11 PM Pacific on Aug 29 is already Aug 30 in UTC; it is still a past day.
    const ours = [
      sampleOurEvent(),
      sampleOurEvent({ title: "Basic Instinct", startTime: "2026-08-29T23:00:00-07:00" }),
    ];
    const scenef = sampleListings({
      screenings: [
        sampleScreening(),
        sampleScreening({ id: "aaa111bbb222", startsAt: "2026-08-29T23:00:00-07:00" }),
      ],
    });
    const now = new Date("2026-08-30T00:30:00-07:00");

    expect(compareWithSceneF(ours, scenef, now)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 1, scenef: 1 },
    });
  });

  it("excludes SceneF showings beyond our horizon, symmetrically", () => {
    const scenef = sampleListings({
      screenings: [
        sampleScreening(),
        sampleScreening({ id: "aaa111bbb222", startsAt: "2026-09-20T19:00:00-07:00" }),
      ],
    });

    expect(compareWithSceneF([sampleOurEvent()], scenef, NOW)).toEqual({
      matched: 1,
      timeMismatches: [],
      titleMismatches: [],
      oursOnly: [],
      scenefOnly: [],
      collapsedDuplicates: 0,
      excluded: { ours: 0, scenef: 1 },
    });
  });
});
