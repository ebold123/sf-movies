import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTheIndependentPage } from "./theIndependent";

function eventHtml({ date, time, title, attractions }: {
  date: string;
  time?: string;
  title: string;
  attractions?: string;
}): string {
  return `
    <div class="tw-event-item">
      <div class="tw-event-date">${date}</div>
      <div class="tw-event-time">${time ?? ""}</div>
      <div class="tw-name"><a href="/e/${encodeURIComponent(title)}">${title}</a></div>
      <div class="tw-attractions">${attractions ?? ""}</div>
    </div>
  `;
}

describe("parseTheIndependentPage", () => {
  it("parses a listing with a time into an 8pm-default-free event", () => {
    const html = eventHtml({ date: "9.8", time: "8:00 PM", title: "Turnstile" });
    const events = parseTheIndependentPage(html, "https://sfindependent.com", "The Independent");

    expect(events).toEqual([
      {
        theater: "The Independent",
        title: "Turnstile",
        startTime: expect.stringMatching(/^\d{4}-09-08T20:00:00-0[78]:00$/),
        sourceUrl: "https://sfindependent.com/e/Turnstile",
      },
    ]);
  });

  it("defaults to 8pm when no time is present", () => {
    const html = eventHtml({ date: "10.1", title: "No Time Show" });
    const events = parseTheIndependentPage(html, "https://sfindependent.com", "The Independent");

    expect(events[0].startTime).toMatch(/T20:00:00-0[78]:00$/);
  });

  it("includes attractions as synopsis when present", () => {
    const html = eventHtml({ date: "9.8", time: "8:00 PM", title: "Show", attractions: "Support Act" });
    const events = parseTheIndependentPage(html, "https://sfindependent.com", "The Independent");

    expect(events[0].synopsis).toBe("Support Act");
  });

  it("skips items with no title or link", () => {
    const html = `
      <div class="tw-event-item">
        <div class="tw-event-date">9.8</div>
        <div class="tw-name"><a href=""></a></div>
      </div>
    `;
    expect(parseTheIndependentPage(html, "https://sfindependent.com", "The Independent")).toEqual([]);
  });

  describe("year inference", () => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      process.env.TZ = originalTz;
    });

    it("infers the current year using the venue's timezone, not the server's local timezone", () => {
      // 2026-09-01T04:30:00Z is still 2026-08-31 evening in America/Los_Angeles
      // (PDT, UTC-7). A server running in UTC would see "today" as Sept 1 and
      // wrongly push an Aug 31 listing a year into the future.
      process.env.TZ = "UTC";
      vi.setSystemTime(new Date("2026-09-01T04:30:00Z"));

      const html = eventHtml({ date: "8.31", time: "9:00 PM", title: "Late Set" });
      const events = parseTheIndependentPage(html, "https://sfindependent.com", "The Independent");

      expect(events[0].startTime.startsWith("2026-08-31")).toBe(true);
    });

    it("still rolls over to next year once the venue-local date has passed", () => {
      process.env.TZ = "UTC";
      vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));

      const html = eventHtml({ date: "1.1", time: "9:00 PM", title: "New Year Show" });
      const events = parseTheIndependentPage(html, "https://sfindependent.com", "The Independent");

      expect(events[0].startTime.startsWith("2027-01-01")).toBe(true);
    });
  });
});
