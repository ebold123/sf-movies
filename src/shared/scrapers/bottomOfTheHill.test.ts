import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBottomOfTheHillEvents, parseBottomOfTheHillDetail } from "./bottomOfTheHill";

function detailHtml({ bands, time }: { bands: string[]; time?: string }): string {
  const bandTags = bands.map((b) => `<big class="band">${b}</big>`).join("");
  return `
    <html><body>
      ${bandTags}
      ${bandTags}
      ${time ? `<span class="time">music at ${time}</span>` : ""}
    </body></html>
  `;
}

describe("parseBottomOfTheHillDetail", () => {
  it("returns null when the URL has no date", () => {
    const html = detailHtml({ bands: ["Band A"] });
    expect(parseBottomOfTheHillDetail(html, "https://bottomofthehill.com/calendar.html", "Bottom of the Hill")).toBeNull();
  });

  it("returns null when there are no bands", () => {
    const html = detailHtml({ bands: [] });
    expect(parseBottomOfTheHillDetail(html, "https://bottomofthehill.com/20260909.html", "Bottom of the Hill")).toBeNull();
  });

  it("dedupes repeated band elements and defaults to 8:30pm", () => {
    const html = detailHtml({ bands: ["Band A", "Band B"] });
    const event = parseBottomOfTheHillDetail(html, "https://bottomofthehill.com/20260909.html", "Bottom of the Hill");

    expect(event).toMatchObject({
      title: "Band A",
      synopsis: "with Band B",
    });
    expect(event?.startTime).toMatch(/T20:30:00-0[78]:00$/);
  });

  it("parses the music start time out of the page body", () => {
    const html = detailHtml({ bands: ["Band A"], time: "9:15 pm" });
    const event = parseBottomOfTheHillDetail(html, "https://bottomofthehill.com/20260909.html", "Bottom of the Hill");

    expect(event?.startTime).toMatch(/T21:15:00-0[78]:00$/);
  });
});

describe("fetchBottomOfTheHillEvents", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("filters out past-year detail links using the venue's timezone, not the server's", async () => {
    // Just after midnight UTC on Jan 1 is still Dec 31 in the evening in
    // America/Los_Angeles. A server running in UTC would wrongly treat the
    // new year as "current" a few hours early and drop that night's show.
    process.env.TZ = "UTC";
    vi.setSystemTime(new Date("2027-01-01T02:00:00Z"));

    const calendarHtml = `
      <a href="/20261231.html">Dec 31</a>
      <a href="/20251231.html">old show</a>
    `;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("calendar.html")) {
        return { text: async () => calendarHtml } as Response;
      }
      return { text: async () => detailHtml({ bands: ["Band A"] }) } as Response;
    });

    const events = await fetchBottomOfTheHillEvents("https://bottomofthehill.com", "Bottom of the Hill", fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://bottomofthehill.com/20261231.html");
    expect(fetchFn).not.toHaveBeenCalledWith("https://bottomofthehill.com/20251231.html");
    expect(events).toHaveLength(1);
  });

  it("keeps events from detail pages that succeed even when another detail page fetch fails", async () => {
    vi.useRealTimers();

    const calendarHtml = `
      <a href="/20991201.html">good show</a>
      <a href="/20991202.html">broken show</a>
    `;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("calendar.html")) {
        return { text: async () => calendarHtml } as Response;
      }
      if (url.endsWith("20991202.html")) {
        throw new Error("network error");
      }
      return { text: async () => detailHtml({ bands: ["Good Band"] }) } as Response;
    });

    const events = await fetchBottomOfTheHillEvents("https://bottomofthehill.com", "Bottom of the Hill", fetchFn);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Good Band");
  });
});
