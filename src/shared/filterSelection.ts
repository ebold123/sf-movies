import type { Event } from "./events/event";
import { localDayOf } from "./events/schedule";

// An inclusive span of America/Los_Angeles calendar days. Unlike the title and
// theater filters, the day filter has no "off" state — it is always narrowing
// the list to some range, wide or narrow.
export interface DayRange {
  from: string;
  to: string;
}

// Everything the browse list is currently filtered by. `title` and `theaters`
// are off at their identity values ("" matches every title, an empty set
// matches every theater), so neither needs a sentinel.
export interface FilterSelection {
  title: string;
  dayRange: DayRange;
  theaters: ReadonlySet<string>;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// The range the page opens on, and the one the day filter's Clear button
// returns to: the near-term schedule rather than every future showtime. `now`
// is passed in rather than read from the clock so it can be pinned in a test.
export function defaultDayRange(now: Date): DayRange {
  return {
    from: localDayOf(now),
    to: localDayOf(new Date(now.getTime() + TWO_WEEKS_MS)),
  };
}

// Case-insensitive substring match. An empty needle matches every title — no
// special-casing needed, since every string includes "".
function matchesTitle(title: string, needle: string): boolean {
  return title.toLowerCase().includes(needle.toLowerCase());
}

function withinDayRange(day: string, range: DayRange): boolean {
  return day >= range.from && day <= range.to;
}

// An empty set means "no theater filter" rather than "no theaters" — the same
// identity trick the title filter gets for free from "".
function matchesTheater(theater: string, theaters: ReadonlySet<string>): boolean {
  return theaters.size === 0 || theaters.has(theater);
}

// A showing belongs to the America/Los_Angeles calendar day it starts on. That
// conversion happens here rather than at render time, so the timezone rule and
// the comparison it feeds live in the same module.
export function matches(
  selection: FilterSelection,
  event: Pick<Event, "title" | "theater" | "startTime">,
): boolean {
  return (
    matchesTitle(event.title, selection.title) &&
    withinDayRange(localDayOf(new Date(event.startTime)), selection.dayRange) &&
    matchesTheater(event.theater, selection.theaters)
  );
}

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

// Parses a plain "YYYY-MM-DD" calendar day at UTC noon, so the browser's own
// timezone can't reinterpret it onto the neighbouring day.
function formatDay(day: string): string {
  return monthDayFormatter.format(new Date(`${day}T12:00:00Z`));
}

// The text each filter pill shows. These live beside `matches` so that what a
// filter does and what it says it does are decided in one place — in
// particular, each criterion's "off" state is spelled out only once.
export function labels(selection: FilterSelection): {
  title: string;
  day: string;
  theaters: string;
} {
  const title = selection.title.trim();
  const { from, to } = selection.dayRange;
  const theaterCount = selection.theaters.size;

  return {
    title: title === "" ? "title" : `title: ${title}`,
    day: from === to ? `day: ${formatDay(from)}` : `day: ${formatDay(from)}–${formatDay(to)}`,
    theaters: theaterCount === 0 ? "venues" : `venues: ${theaterCount}`,
  };
}
