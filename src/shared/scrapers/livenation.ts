import * as cheerio from "cheerio";
import type { Event } from "../events/event";

// Live Nation venue pages (the Fillmore, and any other Live Nation-run venue
// sharing this site template) render their show list client-side, but
// server-render each show as schema.org JSON-LD for SEO — already carrying
// an explicit America/Los_Angeles offset, so no timezone conversion is
// needed here.
const CANCELLED_STATUSES = new Set([
  "https://schema.org/EventCancelled",
  "https://schema.org/EventPostponed",
]);

// Ticketmaster represents a multi-night bundle ticket (e.g. "My Morning
// Jacket - Seven (7) Show Ticket") as its own JSON-LD block alongside the
// real per-night listings, always at this exact sentinel time — skipped so
// the bundle doesn't show up as a phantom showing.
const BUNDLE_SENTINEL_TIME = /T00:00:01[+-]\d{2}:\d{2}$/;

interface LiveNationJsonLd {
  "@type"?: string;
  name?: string;
  startDate?: string;
  url?: string;
  eventStatus?: string;
}

export function parseLiveNationPage(html: string, theater: string): Event[] {
  const $ = cheerio.load(html);
  const events: Event[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let data: LiveNationJsonLd;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }

    if (data["@type"] !== "MusicEvent" && data["@type"] !== "Event") return;
    if (!data.name || !data.startDate || !data.url) return;
    if (data.eventStatus && CANCELLED_STATUSES.has(data.eventStatus)) return;
    if (BUNDLE_SENTINEL_TIME.test(data.startDate)) return;

    events.push({
      theater,
      title: data.name,
      startTime: data.startDate,
      sourceUrl: data.url,
    });
  });

  return events;
}

export async function fetchLiveNationEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const response = await fetchFn(`${baseUrl}/shows`);
  const html = await response.text();
  return parseLiveNationPage(html, theater);
}
