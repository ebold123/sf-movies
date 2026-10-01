import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSeeTicketsEvents, parseSeeTicketsFragment } from "./seetickets";

function card({
  title,
  support = "",
  date,
  showtime,
  detailUrl,
}: {
  title: string;
  support?: string;
  date: string;
  showtime: string;
  detailUrl: string;
}): string {
  return `
    <div class="mdc-card seetickets-list-event-container">
      <div class="event-info-block">
        <p class="fs-18 bold mb-12 event-title"><a href="${detailUrl}" target="_blank">${title}</a></p>
        <p class="fs-12 supporting-talent">${support}</p>
        <p class="fs-18 bold mt-1r event-date">${date}</p>
        <p class="fs-12 doortime-showtime">Event Doortime: <span class="see-doortime">7:00PM</span> / Event Showtime: <span class="see-showtime">${showtime}</span></p>
      </div>
    </div>
  `;
}

describe("parseSeeTicketsFragment", () => {
  const originalTz = process.env.TZ;

  // The listing has no year, so the parser infers it from today's date.
  // Pin the clock before every fixture date so these tests don't start
  // failing once those dates pass.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T19:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("extracts title, support act, date and showtime from an event card", () => {
    const html = card({
      title: "Beth Orton and her band",
      support: "with Kenny Stahl",
      date: "Wed Sep 30",
      showtime: "8:00PM",
      detailUrl: "https://wl.seetickets.us/event/beth-orton-and-her-band/688269",
    });

    expect(parseSeeTicketsFragment(html, "Great American Music Hall")).toEqual([
      {
        theater: "Great American Music Hall",
        title: "Beth Orton and her band",
        startTime: "2026-09-30T20:00:00-07:00",
        sourceUrl: "https://wl.seetickets.us/event/beth-orton-and-her-band/688269",
        synopsis: "with Kenny Stahl",
      },
    ]);
  });

  it("skips shows whose title the venue prefixes with CANCELLED", () => {
    const html = card({
      title: "CANCELLED - INAYAH",
      date: "Mon Sep 28",
      showtime: "8:00PM",
      detailUrl: "https://wl.seetickets.us/event/cancelled-inayah/697868",
    });

    expect(parseSeeTicketsFragment(html, "Great American Music Hall")).toEqual([]);
  });

  it("omits synopsis when there's no supporting talent", () => {
    const html = card({
      title: "Solo Act",
      date: "Sat Oct 10",
      showtime: "8:00PM",
      detailUrl: "https://wl.seetickets.us/event/solo-act/1",
    });

    expect(parseSeeTicketsFragment(html, "Great American Music Hall")).toEqual([
      {
        theater: "Great American Music Hall",
        title: "Solo Act",
        startTime: "2026-10-10T20:00:00-07:00",
        sourceUrl: "https://wl.seetickets.us/event/solo-act/1",
      },
    ]);
  });

  describe("year inference", () => {
    it("uses the venue's date, not the server's, to decide whether a show has passed", () => {
      // 2026-10-01T04:30:00Z is still the evening of Sept 30 in
      // America/Los_Angeles (PDT, UTC-7). A server running in UTC would see
      // "today" as Oct 1 and push tonight's show a year into the future.
      process.env.TZ = "UTC";
      vi.setSystemTime(new Date("2026-10-01T04:30:00Z"));

      const html = card({
        title: "Tonight's Show",
        date: "Wed Sep 30",
        showtime: "9:00PM",
        detailUrl: "https://wl.seetickets.us/event/tonight/1",
      });

      expect(parseSeeTicketsFragment(html, "Great American Music Hall")[0].startTime).toBe(
        "2026-09-30T21:00:00-07:00",
      );
    });

    it("rolls over to next year once the venue-local date has passed", () => {
      process.env.TZ = "UTC";
      vi.setSystemTime(new Date("2026-12-15T20:00:00Z"));

      const html = card({
        title: "New Year Show",
        date: "Fri Jan 1",
        showtime: "9:00PM",
        detailUrl: "https://wl.seetickets.us/event/new-year/1",
      });

      expect(parseSeeTicketsFragment(html, "Great American Music Hall")[0].startTime).toBe(
        "2027-01-01T21:00:00-08:00",
      );
    });
  });
});

describe("fetchSeeTicketsEvents", () => {
  it("fetches the calendar page and follows pagination via the AJAX endpoint it declares", async () => {
    const page1 = `
      <script>var seetickets_ajax_obj = {"ajax_url":"https://gamh.com/wp-admin/admin-ajax.php","nonce":"abc123"};</script>
      ${card({
        title: "Page One Band",
        date: "Wed Sep 30",
        showtime: "8:00PM",
        detailUrl: "https://wl.seetickets.us/event/page-one/1",
      })}
      <button class="seetickets-list-view-load-more-button" data-see-ajax-page="2" data-see-total-pages="2"></button>
    `;
    const page2 = card({
      title: "Page Two Band",
      date: "Thu Oct 1",
      showtime: "9:00PM",
      detailUrl: "https://wl.seetickets.us/event/page-two/2",
    });

    const fetchFn = vi.fn(async (url: string) => ({
      text: async () => (url.includes("admin-ajax.php") ? page2 : page1),
    })) as unknown as (url: string) => Promise<Response>;

    const events = await fetchSeeTicketsEvents("https://gamh.com", "Great American Music Hall", fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://gamh.com/calendar/");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://gamh.com/wp-admin/admin-ajax.php?action=get_seetickets_events&seeAjaxPage=2&listType=grid&nonce=abc123",
    );
    expect(events.map((e) => e.title)).toEqual(["Page One Band", "Page Two Band"]);
  });

  it("returns just the first page when no pagination is declared", async () => {
    const page1 = card({
      title: "Only Band",
      date: "Wed Sep 30",
      showtime: "8:00PM",
      detailUrl: "https://wl.seetickets.us/event/only/1",
    });
    const fetchFn = vi.fn(async () => ({ text: async () => page1 }) as Response);

    const events = await fetchSeeTicketsEvents("https://gamh.com", "Great American Music Hall", fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(events.map((e) => e.title)).toEqual(["Only Band"]);
  });
});
