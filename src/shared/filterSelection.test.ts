import { describe, expect, it } from "vitest";
import { defaultDayRange, labels, matches, type FilterSelection } from "./filterSelection";
import { sampleEvents } from "./events/sampleEvents";

// A complete selection with both optional filters at their "off" state and a
// day range wide enough to cover all of sampleEvents. Later tests narrow one
// field at a time, so each one shows exactly which criterion it exercises.
const sampleSelection: FilterSelection = {
  title: "",
  dayRange: { from: "2026-08-01", to: "2026-08-31" },
  theaters: new Set(),
};

describe("matches", () => {
  it("matches every event when title and theater are off and the day range is wide", () => {
    expect(sampleEvents.every((event) => matches(sampleSelection, event))).toBe(true);
  });

  it("keeps only events whose title contains the needle, case-insensitively", () => {
    const selection = { ...sampleSelection, title: "handmaiden" };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([sampleEvents[2]]);
  });

  it("keeps nothing when no title contains the needle", () => {
    const selection = { ...sampleSelection, title: "Nonexistent Movie" };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([]);
  });

  it("includes events falling on the first and last day of the range", () => {
    const selection = { ...sampleSelection, dayRange: { from: "2026-08-14", to: "2026-08-15" } };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual(sampleEvents);
  });

  it("narrows to a single day when from and to are the same", () => {
    const selection = { ...sampleSelection, dayRange: { from: "2026-08-15", to: "2026-08-15" } };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([
      sampleEvents[3],
      sampleEvents[4],
    ]);
  });

  it("keeps nothing when the range falls outside every event", () => {
    const selection = { ...sampleSelection, dayRange: { from: "2026-08-20", to: "2026-08-21" } };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([]);
  });

  it("keeps events at any of the selected theaters", () => {
    const selection = { ...sampleSelection, theaters: new Set(["Vogue", "4-Star"]) };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([
      sampleEvents[2],
      sampleEvents[3],
      sampleEvents[4],
    ]);
  });

  it("keeps nothing when the selected theater has no events", () => {
    const selection = { ...sampleSelection, theaters: new Set(["Roxie"]) };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([]);
  });

  it("requires every criterion at once, not any of them", () => {
    // "Your Name." plays at both Balboa and Vogue; only the Vogue showing
    // satisfies the title and the theater together.
    const selection = {
      ...sampleSelection,
      title: "your name",
      theaters: new Set(["Vogue"]),
    };

    expect(sampleEvents.filter((event) => matches(selection, event))).toEqual([sampleEvents[3]]);
  });

  it("counts a late-night showing as the LA day it starts on, not the UTC day", () => {
    // 11pm PDT on Aug 14 is already Aug 15 in UTC — the LA calendar day is
    // what decides, which is why the conversion lives in this module rather
    // than in whatever renders the showing.
    const lateShow = {
      title: "The Rocky Horror Picture Show",
      theater: "Balboa",
      startTime: "2026-08-14T23:00:00-07:00",
    };

    const aug14 = { ...sampleSelection, dayRange: { from: "2026-08-14", to: "2026-08-14" } };
    const aug15 = { ...sampleSelection, dayRange: { from: "2026-08-15", to: "2026-08-15" } };

    expect(matches(aug14, lateShow)).toBe(true);
    expect(matches(aug15, lateShow)).toBe(false);
  });
});

describe("labels", () => {
  it("describes every filter that is on, trimming the title", () => {
    const selection: FilterSelection = {
      title: "  your name  ",
      dayRange: { from: "2026-08-14", to: "2026-08-15" },
      theaters: new Set(["Vogue", "4-Star"]),
    };

    expect(labels(selection)).toEqual({
      title: "title: your name",
      day: "day: Aug 14–Aug 15",
      theaters: "venues: 2",
    });
  });

  it("falls back to the bare filter name when title and theaters are off", () => {
    expect(labels(sampleSelection)).toEqual({
      title: "title",
      day: "day: Aug 1–Aug 31",
      theaters: "venues",
    });
  });

  it("names a single day once rather than as a range", () => {
    const selection = { ...sampleSelection, dayRange: { from: "2026-08-15", to: "2026-08-15" } };

    expect(labels(selection).day).toBe("day: Aug 15");
  });
});

// 2026-08-15T04:00Z is 9pm PDT on Aug 14 — the LA calendar day, not the UTC
// one, is where the default range starts.
const NOW = new Date("2026-08-15T04:00:00.000Z");

describe("defaultDayRange", () => {
  it("spans today through two weeks out, in LA calendar days", () => {
    expect(defaultDayRange(NOW)).toEqual({ from: "2026-08-14", to: "2026-08-28" });
  });
});
