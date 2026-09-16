import { describe, expect, it, vi } from "vitest";
import { fetchTribeEvents, parseTribeEvent } from "./tribeEvents";

describe("parseTribeEvent", () => {
  it("normalizes a plain event with a start and end time", () => {
    const raw = {
      title: "syllabary: poetry + music",
      start_date: "2026-08-20 19:00:00",
      end_date: "2026-08-20 22:00:00",
      timezone: "America/Los_Angeles",
      url: "https://artiststelevisionaccess.org/event/syllabary-poetry-music/",
    };

    expect(parseTribeEvent(raw, "ATA")).toEqual({
      theater: "ATA",
      title: "syllabary: poetry + music",
      startTime: "2026-08-20T19:00:00-07:00",
      endTime: "2026-08-20T22:00:00-07:00",
      sourceUrl: "https://artiststelevisionaccess.org/event/syllabary-poetry-music/",
    });
  });

  it("strips HTML from the description and puts it in synopsis", () => {
    const raw = {
      title: "syllabary: poetry + music",
      start_date: "2026-08-20 19:00:00",
      end_date: "2026-08-20 22:00:00",
      timezone: "America/Los_Angeles",
      url: "https://artiststelevisionaccess.org/event/syllabary-poetry-music/",
      description: "<p><em>duo, trio &amp; quartet performances</em></p>\n<p>Free and open to the public.</p>",
    };

    expect(parseTribeEvent(raw, "ATA").synopsis).toBe(
      "duo, trio & quartet performances\nFree and open to the public.",
    );
  });

  it("has no endTime when the raw event has no end_date", () => {
    const raw = {
      title: "OpenScreening",
      start_date: "2026-09-03 20:00:00",
      timezone: "America/Los_Angeles",
      url: "https://artiststelevisionaccess.org/event/openscreening/2026-09-03/",
    };

    expect(parseTribeEvent(raw, "ATA").endTime).toBeUndefined();
  });
});

describe("fetchTribeEvents", () => {
  it("follows pagination and normalizes every page's events", async () => {
    const page1 = {
      events: [
        {
          title: "syllabary: poetry + music",
          start_date: "2026-08-20 19:00:00",
          end_date: "2026-08-20 22:00:00",
          timezone: "America/Los_Angeles",
          url: "https://artiststelevisionaccess.org/event/syllabary-poetry-music/",
        },
      ],
      next_rest_url:
        "https://artiststelevisionaccess.org/wp-json/tribe/events/v1/events/?per_page=1&page=2",
    };
    const page2 = {
      events: [
        {
          title: "OpenScreening",
          start_date: "2026-09-03 20:00:00",
          timezone: "America/Los_Angeles",
          url: "https://artiststelevisionaccess.org/event/openscreening/2026-09-03/",
        },
      ],
    };

    const fetchFn = vi.fn(async (url: string) => {
      const body = url.includes("page=2") ? page2 : page1;
      return { json: async () => body } as Response;
    });

    const events = await fetchTribeEvents("https://artiststelevisionaccess.org", "ATA", fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      parseTribeEvent(page1.events[0], "ATA"),
      parseTribeEvent(page2.events[0], "ATA"),
    ]);
  });

  it("stops paginating once a page's events fall past the 6-month cutoff, even if the API keeps sending next_rest_url", async () => {
    const inRangeEvent = {
      title: "syllabary: poetry + music",
      start_date: "2026-08-20 19:00:00",
      timezone: "America/Los_Angeles",
      url: "https://artiststelevisionaccess.org/event/syllabary-poetry-music/",
    };
    const farFutureEvent = {
      title: "some 2028 event",
      start_date: "2028-01-01 19:00:00",
      timezone: "America/Los_Angeles",
      url: "https://artiststelevisionaccess.org/event/far-future/",
    };

    const page1 = {
      events: [inRangeEvent],
      next_rest_url: "https://artiststelevisionaccess.org/wp-json/tribe/events/v1/events/?page=2",
    };
    // Simulates an API that ignores end_date on later pages and would keep
    // paginating into the far future forever if not stopped client-side.
    const page2 = {
      events: [farFutureEvent],
      next_rest_url: "https://artiststelevisionaccess.org/wp-json/tribe/events/v1/events/?page=3",
    };

    const fetchFn = vi.fn(async (url: string) => {
      const body = url.includes("page=2") ? page2 : page1;
      return { json: async () => body } as Response;
    });

    const events = await fetchTribeEvents("https://artiststelevisionaccess.org", "ATA", fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(events).toEqual([parseTribeEvent(inRangeEvent, "ATA")]);
  });
});
