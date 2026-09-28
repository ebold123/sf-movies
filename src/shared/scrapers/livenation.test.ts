import { describe, expect, it, vi } from "vitest";
import { fetchLiveNationEvents, parseLiveNationPage } from "./livenation";

function ldJson(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

const scheduledShow = {
  "@type": "MusicEvent",
  name: "Gillian Welch & David Rawlings",
  startDate: "2026-10-02T20:00:00-07:00",
  url: "https://www.ticketmaster.com/gillian-welch-david-rawlings-san-francisco-california-10-02-2026/event/1C0064F49E64932C",
  eventStatus: "https://schema.org/EventScheduled",
};

const bundleTicket = {
  "@type": "MusicEvent",
  name: "My Morning Jacket - Seven (7) Show Ticket",
  startDate: "2026-10-03T00:00:01-07:00",
  url: "https://www.ticketmaster.com/my-morning-jacket-seven-7-show-san-francisco-california-10-03-2026/event/1C00647DAA0A87C3",
  eventStatus: "https://schema.org/EventScheduled",
};

const cancelledShow = {
  "@type": "MusicEvent",
  name: "Cancelled Band",
  startDate: "2026-10-05T20:00:00-07:00",
  url: "https://www.ticketmaster.com/cancelled-band",
  eventStatus: "https://schema.org/EventCancelled",
};

describe("parseLiveNationPage", () => {
  it("extracts scheduled shows from embedded JSON-LD", () => {
    const html = `<html><body>${ldJson(scheduledShow)}</body></html>`;

    expect(parseLiveNationPage(html, "The Fillmore")).toEqual([
      {
        theater: "The Fillmore",
        title: "Gillian Welch & David Rawlings",
        startTime: "2026-10-02T20:00:00-07:00",
        sourceUrl:
          "https://www.ticketmaster.com/gillian-welch-david-rawlings-san-francisco-california-10-02-2026/event/1C0064F49E64932C",
      },
    ]);
  });

  it("skips multi-night bundle tickets, sold at the 00:00:01 sentinel time", () => {
    const html = `<html><body>${ldJson(scheduledShow)}${ldJson(bundleTicket)}</body></html>`;

    const events = parseLiveNationPage(html, "The Fillmore");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Gillian Welch & David Rawlings");
  });

  it("skips cancelled and postponed shows", () => {
    const html = `<html><body>${ldJson(scheduledShow)}${ldJson(cancelledShow)}</body></html>`;

    const events = parseLiveNationPage(html, "The Fillmore");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Gillian Welch & David Rawlings");
  });

  it("ignores non-event JSON-LD blocks and malformed JSON", () => {
    const html = `<html><body>
      ${ldJson({ "@type": "BreadcrumbList", itemListElement: [] })}
      <script type="application/ld+json">{ not valid json </script>
      ${ldJson(scheduledShow)}
    </body></html>`;

    expect(parseLiveNationPage(html, "The Fillmore")).toEqual([
      {
        theater: "The Fillmore",
        title: "Gillian Welch & David Rawlings",
        startTime: "2026-10-02T20:00:00-07:00",
        sourceUrl:
          "https://www.ticketmaster.com/gillian-welch-david-rawlings-san-francisco-california-10-02-2026/event/1C0064F49E64932C",
      },
    ]);
  });
});

describe("fetchLiveNationEvents", () => {
  it("fetches the venue's /shows page and parses it", async () => {
    const html = `<html><body>${ldJson(scheduledShow)}</body></html>`;
    const fetchFn = vi.fn(async () => ({ text: async () => html }) as Response);

    const events = await fetchLiveNationEvents("https://www.thefillmore.com", "The Fillmore", fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://www.thefillmore.com/shows");
    expect(events).toEqual(parseLiveNationPage(html, "The Fillmore"));
  });
});
