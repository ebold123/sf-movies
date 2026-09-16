import * as cheerio from "cheerio";
import type { Event } from "../events/event";
import { zonedIsoString, zonedTimeToUtc } from "../timezone";

interface TribeEventsPage {
  events: RawTribeEvent[];
  next_rest_url?: string;
}

interface RawTribeEvent {
  title: string;
  start_date: string;
  end_date?: string;
  timezone: string;
  url: string;
  description?: string;
}

const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function toIsoString(dateString: string, timeZone: string): string {
  const match = dateString.match(WALL_CLOCK_PATTERN);
  if (!match) {
    throw new Error(`Unrecognized tribe events date: ${dateString}`);
  }
  const [, year, month, day, hour, minute] = match;
  const utc = zonedTimeToUtc(Number(year), Number(month), Number(day), Number(hour), Number(minute), timeZone);
  return zonedIsoString(utc, timeZone);
}

function htmlToText(html: string): string {
  return cheerio.load(html).text().trim();
}

export function parseTribeEvent(raw: RawTribeEvent, theater: string): Event {
  return {
    theater,
    title: raw.title,
    startTime: toIsoString(raw.start_date, raw.timezone),
    ...(raw.end_date !== undefined && { endTime: toIsoString(raw.end_date, raw.timezone) }),
    sourceUrl: raw.url,
    ...(raw.description !== undefined && { synopsis: htmlToText(raw.description) }),
  };
}

export async function fetchTribeEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const endDate = sixMonthsOut.toISOString().slice(0, 10);

  const events: Event[] = [];
  let url: string | undefined = `${baseUrl}/wp-json/tribe/events/v1/events?per_page=50&end_date=${endDate}`;

  while (url) {
    const response = await fetchFn(url);
    const page: TribeEventsPage = await response.json();

    // Re-check the cutoff on every page: the API is only asked to filter by
    // end_date on the first request, and next_rest_url is followed as given,
    // so a server that doesn't honor (or drops) the filter on later pages
    // could otherwise return unbounded future events.
    let withinRange = false;
    for (const raw of page.events) {
      if (raw.start_date.slice(0, 10) <= endDate) {
        events.push(parseTribeEvent(raw, theater));
        withinRange = true;
      }
    }

    // Events come back in ascending start_date order, so once a page has no
    // events left within range, later pages won't either.
    url = withinRange || page.events.length === 0 ? page.next_rest_url : undefined;
  }

  return events;
}
