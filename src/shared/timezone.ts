// The UTC offset (in minutes, positive = ahead of UTC) that `timeZone` has
// at the given instant. DST-aware since it's computed for that specific
// instant, not a fixed value.
function utcOffsetMinutes(date: Date, timeZone: string): number {
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = offsetName?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Could not determine UTC offset for ${timeZone} at ${offsetName}`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

// Converts a wall-clock date/time in a named timezone into the correct UTC
// instant, without a date library. Roxie's calendar only gives us local PT
// times as plain text ("7:10 pm"), so this is what turns that into an
// unambiguous, DST-correct timestamp.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const anchor = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = utcOffsetMinutes(new Date(anchor), timeZone);
  return new Date(anchor - offsetMinutes * 60_000);
}

// Formats a UTC instant as an ISO 8601 string using `timeZone`'s own
// wall-clock date/time and offset (e.g. "2026-08-13T16:45:00-07:00"),
// instead of Date#toISOString()'s fixed "Z" suffix. Still an unambiguous
// instant — `new Date(...)` parses the offset correctly — but keeps
// movie-data/*.json readable at a glance against a theater's own listing,
// which is always in local time.
export function zonedIsoString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  const offsetMinutes = utcOffsetMinutes(date, timeZone);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const offsetMinutesPart = String(absMinutes % 60).padStart(2, "0");

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${sign}${offsetHours}:${offsetMinutesPart}`;
}

// Today's wall-clock date in `timeZone`, not the server's local date. Scrapers
// that infer a missing year from "is this month/day still ahead of today"
// need this instead of `new Date()`, whose getFullYear/getMonth/getDate read
// the server's own zone and can be a day off from the venue's local date.
export function todayInZone(timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Shared 12-hour -> 24-hour conversion for scrapers parsing "7:10 PM"-style times.
export function to24Hour(hour12: number, minute: number, meridiem: string): { hour: number; minute: number } {
  const hour = (hour12 % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  return { hour, minute };
}
