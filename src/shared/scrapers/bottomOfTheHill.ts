import * as cheerio from "cheerio";
import type { Event } from "../events/event";
import { to24Hour, todayInZone, zonedIsoString, zonedTimeToUtc } from "../timezone";

const LA_TIME_ZONE = "America/Los_Angeles";
const DATE_URL_PATTERN = /\/(\d{4})(\d{2})(\d{2})\.html$/;
const MUSIC_TIME_PATTERN = /music at (\d{1,2}):(\d{2})\s*(am|pm)/i;

// Parses a single show detail page (e.g. bottomofthehill.com/20260909.html).
// Date is extracted from the URL; bands come from <big class="band"> elements
// (deduplicated — they appear twice in the page); music start time is spread
// across multiple <span class="time"> fragments, so we match against full body text.
export function parseBottomOfTheHillDetail(html: string, url: string, theater: string): Event | null {
  const dateMatch = url.match(DATE_URL_PATTERN);
  if (!dateMatch) return null;
  const [, yearStr, monthStr, dayStr] = dateMatch;

  const $ = cheerio.load(html);

  const seen = new Set<string>();
  const bands: string[] = [];
  $(".band").each((_, el) => {
    const name = $(el).text().trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      bands.push(name);
    }
  });
  if (bands.length === 0) return null;

  let musicHour = 20;
  let musicMinute = 30;
  const timeMatch = $("body").text().match(MUSIC_TIME_PATTERN);
  if (timeMatch) {
    ({ hour: musicHour, minute: musicMinute } = to24Hour(
      Number(timeMatch[1]),
      Number(timeMatch[2]),
      timeMatch[3],
    ));
  }

  const startTime = zonedTimeToUtc(
    Number(yearStr),
    Number(monthStr),
    Number(dayStr),
    musicHour,
    musicMinute,
    LA_TIME_ZONE,
  );

  return {
    theater,
    title: bands[0],
    startTime: zonedIsoString(startTime, LA_TIME_ZONE),
    sourceUrl: url,
    ...(bands.length > 1 && { synopsis: `with ${bands.slice(1).join(", ")}` }),
  };
}

export async function fetchBottomOfTheHillEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const calendarResponse = await fetchFn(`${baseUrl}/calendar.html`);
  const calendarHtml = await calendarResponse.text();
  const $ = cheerio.load(calendarHtml);

  const currentYear = todayInZone(LA_TIME_ZONE).year;
  const detailUrls = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const url = href.startsWith("http") ? href : `${baseUrl}${href}`;
    const match = url.match(DATE_URL_PATTERN);
    if (match && Number(match[1]) >= currentYear) {
      detailUrls.add(url);
    }
  });

  const results = await Promise.allSettled(
    [...detailUrls].map(async (url) => {
      const response = await fetchFn(url);
      const html = await response.text();
      return parseBottomOfTheHillDetail(html, url, theater);
    }),
  );

  const events: Event[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value !== null) events.push(result.value);
    } else {
      console.error("Bottom of the Hill: failed to fetch/parse a detail page", result.reason);
    }
  }
  return events;
}
