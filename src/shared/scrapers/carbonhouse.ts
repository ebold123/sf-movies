import * as cheerio from "cheerio";
import type { Event } from "../events/event";
import { zonedIsoString, zonedTimeToUtc } from "../timezone";

const LA_TIME_ZONE = "America/Los_Angeles";

// Carbonhouse (the venue CMS platform behind thewarfieldtheatre.com, and
// likely other AEG/Goldenvoice venues sharing the same template) has no
// per-event JSON-LD — dates/times/status live only in the listing markup.
const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

// e.g. "Mon, Sep 28, 2026" — the leading weekday is redundant with what we
// compute ourselves, so the pattern just skips past it.
const DATE_PATTERN = /([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/;
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;
const CANCELLED = "Cancelled";

function to24Hour(hour12: number, minute: number, meridiem: string): { hour: number; minute: number } {
  const hour = (hour12 % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  return { hour, minute };
}

export function parseCarbonhousePage(html: string, theater: string): Event[] {
  const $ = cheerio.load(html);
  const events: Event[] = [];

  $(".entry").each((_, el) => {
    // The ticket button's title doubles as the on-sale status ("Buy
    // Tickets", "Sold Out", "Coming Soon", "Cancelled") — only a cancelled
    // show is excluded; the others are all still happening.
    const status = $(el).find(".btn-tickets").attr("title");
    if (status === CANCELLED) return;

    const dateMatch = $(el).find(".date-time-container .date").text().match(DATE_PATTERN);
    if (!dateMatch) return;
    const month = MONTHS[dateMatch[1]];
    const day = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (!month) return;

    let hour = 20;
    let minute = 0;
    const timeMatch = $(el).find(".date-time-container .time").text().match(TIME_PATTERN);
    if (timeMatch) {
      ({ hour, minute } = to24Hour(Number(timeMatch[1]), Number(timeMatch[2]), timeMatch[3]));
    }

    const titleLink = $(el).find(".carousel_item_title_small a").first();
    const title = titleLink.text().trim();
    const sourceUrl = titleLink.attr("href")?.trim();
    if (!title || !sourceUrl) return;

    const support = $(el).find(".info .title h4").first().text().trim();

    const startTime = zonedTimeToUtc(year, month, day, hour, minute, LA_TIME_ZONE);

    events.push({
      theater,
      title,
      startTime: zonedIsoString(startTime, LA_TIME_ZONE),
      sourceUrl,
      ...(support.length > 0 && { synopsis: support }),
    });
  });

  return events;
}

export async function fetchCarbonhouseEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const response = await fetchFn(`${baseUrl}/events/all`);
  const html = await response.text();
  return parseCarbonhousePage(html, theater);
}
