import * as cheerio from "cheerio";
import type { Event } from "../events/event";
import { zonedIsoString } from "../timezone";

const LA_TIME_ZONE = "America/Los_Angeles";

// Envelop's /events page is a Next.js page that ships its whole event list in
// the __NEXT_DATA__ script tag (props.pageProps.events). Each event names its
// series as "cms-series/<id>"; we only surface the dance parties and the
// album listening sessions, not workshops, yoga, sound baths and the like.
const WANTED_SERIES = new Set(["dance", "listen"]);

interface EnvelopRawEvent {
  __id__?: string;
  title?: string;
  date?: string;
  series?: string;
}

export function parseEnvelopEvents(html: string, theater: string, baseUrl: string): Event[] {
  const $ = cheerio.load(html);
  const nextData = $("script#__NEXT_DATA__").html();
  if (!nextData) {
    throw new Error("Envelop events page has no __NEXT_DATA__ — its markup may have changed");
  }

  const rawEvents: EnvelopRawEvent[] | undefined = JSON.parse(nextData)?.props?.pageProps?.events;
  if (!Array.isArray(rawEvents)) {
    throw new Error("Envelop __NEXT_DATA__ has no props.pageProps.events list — its data shape may have changed");
  }

  const events: Event[] = [];
  for (const raw of rawEvents) {
    const series = raw.series?.replace(/^cms-series\//, "");
    if (!series || !WANTED_SERIES.has(series)) continue;
    if (!raw.__id__ || !raw.title || !raw.date) continue;

    const start = new Date(raw.date);
    if (Number.isNaN(start.getTime())) continue;

    events.push({
      theater,
      title: raw.title.trim(),
      startTime: zonedIsoString(start, LA_TIME_ZONE),
      sourceUrl: `${baseUrl}/event/${raw.__id__}`,
    });
  }

  return events;
}

export async function fetchEnvelopEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const response = await fetchFn(`${baseUrl}/events`);
  if (!response.ok) {
    throw new Error(`Envelop events page returned HTTP ${response.status}`);
  }
  return parseEnvelopEvents(await response.text(), theater, baseUrl);
}
