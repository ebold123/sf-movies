import { describe, expect, it } from "vitest";
import type { Event } from "./event";
import { mergeEvents } from "./eventStore";

const sampleEvent: Event = {
  theater: "Balboa",
  title: "The Odyssey",
  startTime: "2026-08-14T02:00:00.000Z",
  endTime: "2026-08-14T05:10:00.000Z",
  sourceUrl: "https://www.balboamovies.com/calendar-of-events/the-odyssey-august-13",
  synopsis: "Final Show",
};

const otherEvent: Event = {
  theater: "Balboa",
  title: "The Handmaiden",
  startTime: "2026-08-14T02:30:00.000Z",
  sourceUrl: "https://www.balboamovies.com/calendar-of-events/the-handmaiden-august-13",
};

describe("mergeEvents", () => {
  it("adds new events to an empty list", () => {
    expect(mergeEvents([], [sampleEvent])).toEqual([sampleEvent]);
  });

  it("leaves existing events untouched when they are not part of the incoming batch", () => {
    expect(mergeEvents([otherEvent], [sampleEvent])).toEqual([otherEvent, sampleEvent]);
  });

  it("updates an event that changed, keyed by sourceUrl", () => {
    const updated: Event = { ...sampleEvent, synopsis: "Final Show — sold out" };
    expect(mergeEvents([sampleEvent], [updated])).toEqual([updated]);
  });

  describe("when a theater re-publishes an occurrence under a new URL", () => {
    const madrone: Event = {
      theater: "Madrone Art Bar",
      title: "LIVE MODEL TUESDAY SKETCH",
      startTime: "2026-11-10T18:30:00-08:00",
      sourceUrl: "https://madroneartbar.com/event/livemodelsketch-2026-06-23/2026-11-10/",
    };
    const republished: Event = {
      ...madrone,
      sourceUrl: "https://madroneartbar.com/event/livemodelsketch-2026-06-23-2026-10-06/2026-11-10/",
    };

    it("keeps only the incoming copy of the same theater, start time and title", () => {
      expect(mergeEvents([madrone], [republished])).toEqual([republished]);
    });

    it("collapses duplicates already stored on disk", () => {
      expect(mergeEvents([madrone, republished], [])).toEqual([republished]);
    });

    it("ignores case and extra whitespace in the title", () => {
      const respaced: Event = { ...republished, title: "  Live Model  Tuesday Sketch " };
      expect(mergeEvents([madrone], [respaced])).toEqual([respaced]);
    });

    it("treats the same instant written with a different offset as the same start time", () => {
      const utc: Event = { ...republished, startTime: "2026-11-11T02:30:00.000Z" };
      expect(mergeEvents([madrone], [utc])).toEqual([utc]);
    });

    it("keeps events that differ in start time, title or theater when scraped together", () => {
      const nextWeek: Event = { ...madrone, startTime: "2026-11-17T18:30:00-08:00", sourceUrl: "https://x/1" };
      const otherTitle: Event = { ...madrone, title: "Big Brain", sourceUrl: "https://x/2" };
      const otherVenue: Event = { ...madrone, theater: "The Independent", sourceUrl: "https://x/3" };
      expect(mergeEvents([], [madrone, nextWeek, otherTitle, otherVenue])).toEqual([
        madrone,
        nextWeek,
        otherTitle,
        otherVenue,
      ]);
    });
  });

  describe("when a theater renames an event", () => {
    const stored: Event = {
      theater: "Great American Music Hall",
      title: "PRAYERS",
      startTime: "2026-11-16T19:30:00-08:00",
      sourceUrl: "https://wl.seetickets.us/event/prayers/1",
    };
    const renamed: Event = {
      ...stored,
      title: "*CANCELLED* PRAYERS",
      sourceUrl: "https://wl.seetickets.us/event/cancelled-prayers/1",
    };

    it("replaces the stored event at the same theater and start time", () => {
      expect(mergeEvents([stored], [renamed])).toEqual([renamed]);
    });

    it("matches the start time as an instant, not as text", () => {
      const utc: Event = { ...renamed, startTime: "2026-11-17T03:30:00.000Z" };
      expect(mergeEvents([stored], [utc])).toEqual([utc]);
    });

    it("keeps same-time events that arrive together in one scrape", () => {
      const pass: Event = { ...renamed, title: "PRAYERS: Two-Day Pass", sourceUrl: "https://x/pass" };
      expect(mergeEvents([stored], [renamed, pass])).toEqual([renamed, pass]);
    });

    it("keeps stored events at the same time when nothing incoming shares it", () => {
      const pass: Event = { ...stored, title: "PRAYERS: Two-Day Pass", sourceUrl: "https://x/pass" };
      const other: Event = { ...stored, startTime: "2026-11-20T19:30:00-08:00", sourceUrl: "https://x/other" };
      expect(mergeEvents([stored, pass], [other])).toEqual([stored, pass, other]);
    });

    it("does not replace a same-time event at a different theater", () => {
      const elsewhere: Event = { ...stored, theater: "The Independent", sourceUrl: "https://x/ind" };
      expect(mergeEvents([elsewhere], [renamed])).toEqual([elsewhere, renamed]);
    });
  });
});
