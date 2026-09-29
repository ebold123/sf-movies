import * as cheerio from "cheerio";
import type { Event } from "../events/event";
import { zonedIsoString, zonedTimeToUtc } from "../timezone";

const LA_TIME_ZONE = "America/Los_Angeles";

// "See Tickets" WordPress plugin (used by GAMH, and likely other Another
// Planet Entertainment venues on the same template): /calendar/ renders only
// the first page of events, with the rest behind a "Load More" button that
// calls this same-origin AJAX action — the page embeds both the nonce it
// needs and how many pages exist, so we can just replay every page.
const AJAX_SETTINGS_PATTERN = /seetickets_ajax_obj\s*=\s*\{"ajax_url":"([^"]+)","nonce":"([^"]+)"\}/;
const TOTAL_PAGES_PATTERN = /data-see-total-pages="(\d+)"/;

// e.g. "Mon Sep 28" — no year in the source markup.
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
const DATE_PATTERN = /[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})/;
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;

function to24Hour(hour12: number, minute: number, meridiem: string): { hour: number; minute: number } {
  const hour = (hour12 % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  return { hour, minute };
}

// The listing omits the year. If month/day has already passed this calendar
// year, the show must be next year.
function inferYear(month: number, day: number): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return month < m || (month === m && day < d) ? y + 1 : y;
}

export function parseSeeTicketsFragment(html: string, theater: string): Event[] {
  const $ = cheerio.load(html);
  const events: Event[] = [];

  $(".seetickets-list-event-container").each((_, el) => {
    const titleLink = $(el).find(".event-title a").first();
    const title = titleLink.text().trim();
    const sourceUrl = titleLink.attr("href")?.trim();
    if (!title || !sourceUrl) return;
    // The venue itself marks a cancelled show by prefixing its own title,
    // e.g. "CANCELLED - INAYAH" — the clearest signal available, since the
    // ticket button's CSS class doesn't distinguish cancelled from sold out.
    if (/^cancelled\b/i.test(title)) return;

    const dateMatch = $(el).find(".event-date").text().trim().match(DATE_PATTERN);
    if (!dateMatch) return;
    const month = MONTHS[dateMatch[1]];
    const day = Number(dateMatch[2]);
    if (!month) return;
    const year = inferYear(month, day);

    let hour = 20;
    let minute = 0;
    const showtimeText = $(el).find(".see-showtime").text() || $(el).find(".see-doortime").text();
    const timeMatch = showtimeText.match(TIME_PATTERN);
    if (timeMatch) {
      ({ hour, minute } = to24Hour(Number(timeMatch[1]), Number(timeMatch[2]), timeMatch[3]));
    }

    // Already reads "with Opener One, Opener Two" when present.
    const synopsis = $(el).find(".supporting-talent").text().trim();

    const startTime = zonedTimeToUtc(year, month, day, hour, minute, LA_TIME_ZONE);

    events.push({
      theater,
      title,
      startTime: zonedIsoString(startTime, LA_TIME_ZONE),
      sourceUrl,
      ...(synopsis.length > 0 && { synopsis }),
    });
  });

  return events;
}

export async function fetchSeeTicketsEvents(
  baseUrl: string,
  theater: string,
  fetchFn: (url: string) => Promise<Response> = fetch,
): Promise<Event[]> {
  const firstPageResponse = await fetchFn(`${baseUrl}/calendar/`);
  const firstPageHtml = await firstPageResponse.text();
  const events = parseSeeTicketsFragment(firstPageHtml, theater);

  const ajaxSettings = firstPageHtml.match(AJAX_SETTINGS_PATTERN);
  const totalPages = Number(firstPageHtml.match(TOTAL_PAGES_PATTERN)?.[1] ?? 1);
  if (!ajaxSettings || totalPages <= 1) return events;

  const [ajaxUrl, nonce] = [ajaxSettings[1], ajaxSettings[2]];
  const laterPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(async (page) => {
      const response = await fetchFn(
        `${ajaxUrl}?action=get_seetickets_events&seeAjaxPage=${page}&listType=grid&nonce=${nonce}`,
      );
      return parseSeeTicketsFragment(await response.text(), theater);
    }),
  );

  return events.concat(...laterPages);
}
