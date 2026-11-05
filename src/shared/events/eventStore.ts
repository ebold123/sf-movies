import type { Event } from "./event";

// Some feeds re-publish the same occurrence under a new URL: Madrone Art Bar's
// WordPress appends a date to a recurring event's slug each time the series is
// edited, so one Tuesday sketch night ends up with three sourceUrls. Since the
// store merges on sourceUrl, every old URL would live on beside the new one and
// the page would list the occurrence two or three times. The same theater,
// start time and title is the same event whatever its URL says.
function occurrenceKey(event: Event): string {
  const title = event.title.trim().replace(/\s+/g, " ").toLowerCase();
  return `${event.theater}|${new Date(event.startTime).getTime()}|${title}`;
}

function slotKey(event: Event): string {
  return `${event.theater}|${new Date(event.startTime).getTime()}`;
}

export function mergeEvents(existing: Event[], incoming: Event[]): Event[] {
  const incomingUrls = new Set(incoming.map((event) => event.sourceUrl));
  const incomingSlots = new Set(incoming.map(slotKey));

  // A venue can also rename an event (or tag it "*CANCELLED*", "POSTPONED") and
  // so change its title along with its URL. A stored event at the same theater
  // and start time as a freshly scraped one is therefore treated as superseded,
  // whatever it is now called. This only applies between stored and incoming:
  // two events that arrive together in one scrape (a show and its multi-day
  // pass, say) are both live, so both stay.
  const unrelated = existing.filter(
    (event) => !incomingUrls.has(event.sourceUrl) && !incomingSlots.has(slotKey(event)),
  );

  // Later entries win, so a freshly scraped event replaces any stored copy of
  // the same occurrence. A replaced event keeps its original position.
  const byOccurrence = new Map<string, Event>();
  for (const event of [...unrelated, ...incoming]) {
    byOccurrence.set(occurrenceKey(event), event);
  }
  return [...byOccurrence.values()];
}
