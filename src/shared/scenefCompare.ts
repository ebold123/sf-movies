import type { Event } from "./events/event";
import type { SceneFListingsResponse } from "./scrapers/scenef";
import { zonedIsoString } from "./timezone";

const LA_TIME_ZONE = "America/Los_Angeles";

// One showing in a comparison report, reduced to what a human needs to chase
// the discrepancy: what was playing and when (ISO string in LA time, as both
// feeds already format it).
export interface ShowingRow {
  title: string;
  startTime: string;
}

// The same film paired across feeds at nearly-but-not-exactly the same
// time — the "are our scraped times right" signal.
export interface TimeMismatchRow {
  title: string;
  ourStartTime: string;
  scenefStartTime: string;
}

// Different titles occupying the same start instant. Informational: two
// screens can genuinely play different films at once.
export interface TitleMismatchRow {
  startTime: string;
  ourTitle: string;
  scenefTitle: string;
}

export interface ComparisonReport {
  matched: number;
  timeMismatches: TimeMismatchRow[];
  titleMismatches: TitleMismatchRow[];
  oursOnly: ShowingRow[];
  scenefOnly: ShowingRow[];
  // How many screenings SceneF published twice and we counted once. Context,
  // not a discrepancy — see collapseDuplicates.
  collapsedDuplicates: number;
  excluded: { ours: number; scenef: number };
}

const TIME_MISMATCH_TOLERANCE_MS = 15 * 60 * 1000;

// The strict agreement rule: the feeds agree only when every discrepancy
// class is empty. (Excluded showings are outside the comparable window and
// don't count against agreement.)
export function hasDiscrepancies(report: ComparisonReport): boolean {
  return (
    report.timeMismatches.length > 0 ||
    report.titleMismatches.length > 0 ||
    report.oursOnly.length > 0 ||
    report.scenefOnly.length > 0
  );
}

// A SceneF screening with its film title resolved, still carrying the
// provenance that deduplication needs.
interface SceneFShowing extends ShowingRow {
  sources?: string[];
}

// Two SceneF titles naming the same show. Deliberately looser than
// titlesCompatible: the duplicates differ by a word inserted mid-title
// ("TWIN PEAKS FEST: Season 1…" vs "Twin Peaks: SEASON 1…"), which
// substring containment misses but a word-set subset catches.
function titlesNameSameShow(a: string, b: string): boolean {
  const tokens = (title: string) =>
    new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 0));
  const [smaller, larger] = [tokens(a), tokens(b)].sort((x, y) => x.size - y.size);
  return smaller.size > 0 && [...smaller].every((token) => larger.has(token));
}

// SceneF reads some venues from two places at once. Screenings reported by
// entirely different sources are candidates for being one show seen twice;
// two screenings from the SAME source are two real shows on two screens.
// Without source information there is no evidence either way, so no.
function sourcesDisjoint(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined || a.length === 0 || b.length === 0) return false;
  return !a.some((source) => b.includes(source));
}

// SceneF names a venue's own web calendar by host ("www.balboamovies.com/…")
// and its internal systems with a scheme ("veezi:sessions").
function fromVenueCalendar(showing: SceneFShowing): boolean {
  return (showing.sources ?? []).some((source) => source.includes(".") && !source.includes(":"));
}

// For screenings that don't resolve to a known film, SceneF derives its film
// key from the source's title text — so the same show read from two sources
// with different titling is published twice. Collapse those back into one
// before comparing, or every such screening looks like one we're missing.
function collapseDuplicates(showings: SceneFShowing[]): {
  kept: SceneFShowing[];
  collapsed: number;
} {
  const byInstant = new Map<number, SceneFShowing[]>();
  for (const showing of showings) {
    const instant = Date.parse(showing.startTime);
    byInstant.set(instant, [...(byInstant.get(instant) ?? []), showing]);
  }

  const kept: SceneFShowing[] = [];
  let collapsed = 0;

  for (const group of byInstant.values()) {
    const survivors: SceneFShowing[] = [];
    for (const showing of group) {
      const twinIndex = survivors.findIndex(
        (survivor) =>
          sourcesDisjoint(survivor.sources, showing.sources) &&
          titlesNameSameShow(survivor.title, showing.title),
      );
      if (twinIndex < 0) {
        survivors.push(showing);
        continue;
      }
      // Keep whichever copy came from the venue's own calendar: that's the
      // titling our scrapers read, so reported rows stay recognizable
      // against the theater's listing.
      if (fromVenueCalendar(showing) && !fromVenueCalendar(survivors[twinIndex])) {
        survivors[twinIndex] = showing;
      }
      collapsed += 1;
    }
    kept.push(...survivors);
  }

  return { kept, collapsed };
}

// "Akira 4K" and "Akira" are the same film: titles are compatible when,
// lowercased and stripped to alphanumerics, one contains the other.
function titlesCompatible(a: string, b: string): boolean {
  const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const [shorter, longer] = [normalize(a), normalize(b)].sort((x, y) => x.length - y.length);
  return shorter.length > 0 && longer.includes(shorter);
}

// Diffs our freshly scraped events against SceneF's independently verified
// feed for the same venue. Showings pair up when they start at the same
// instant with the same title; leftovers on either side are reported so
// swallowed or phantom showtimes surface.
function laDate(isoInstant: string): string {
  return zonedIsoString(new Date(isoInstant), LA_TIME_ZONE).slice(0, 10);
}

// The two feeds look different distances into the future, so showings are
// only comparable on days both feeds cover: from the latest of today and the
// two first days through the earlier of the two last days. Showings outside
// that window are counted as excluded, never as discrepancies.
function overlapWindow(
  oursDates: string[],
  theirsDates: string[],
  today: string,
): { first: string; last: string } | undefined {
  if (oursDates.length === 0 || theirsDates.length === 0) return undefined;
  const bounds = (dates: string[]) => [dates.reduce((a, b) => (a < b ? a : b)), dates.reduce((a, b) => (a > b ? a : b))];
  const [oursFirst, oursLast] = bounds(oursDates);
  const [theirsFirst, theirsLast] = bounds(theirsDates);
  return {
    first: [oursFirst, theirsFirst, today].reduce((a, b) => (a > b ? a : b)),
    last: oursLast < theirsLast ? oursLast : theirsLast,
  };
}

export function compareWithSceneF(
  ours: Event[],
  scenef: SceneFListingsResponse,
  now: Date,
): ComparisonReport {
  const titleByFilmKey = new Map(scenef.films.map((film) => [film.key, film.title]));
  const { kept: theirs, collapsed: collapsedDuplicates } = collapseDuplicates(
    scenef.screenings.map((screening) => ({
      title: titleByFilmKey.get(screening.filmKey) ?? "Unknown film",
      startTime: screening.startsAt,
      sources: screening.sources,
    })),
  );

  const window = overlapWindow(
    ours.map((e) => laDate(e.startTime)),
    theirs.map((r) => laDate(r.startTime)),
    laDate(now.toISOString()),
  );
  const inWindow = (isoInstant: string) =>
    window !== undefined && laDate(isoInstant) >= window.first && laDate(isoInstant) <= window.last;

  const comparableOurs = ours.filter((event) => inWindow(event.startTime));
  const comparableTheirs = theirs.filter((row) => inWindow(row.startTime));

  // Greedy, stable pairing: exact-instant matches claim their partner first,
  // then near-miss pairs form from what's left, and only true
  // leftovers land in the one-sided buckets.
  let matched = 0;
  const timeMismatches: TimeMismatchRow[] = [];
  let unpairedOurs = [...comparableOurs];
  const unpairedTheirs = [...comparableTheirs];

  unpairedOurs = unpairedOurs.filter((event) => {
    const pairIndex = unpairedTheirs.findIndex(
      (row) =>
        Date.parse(row.startTime) === Date.parse(event.startTime) &&
        titlesCompatible(row.title, event.title),
    );
    if (pairIndex < 0) return true;
    unpairedTheirs.splice(pairIndex, 1);
    matched += 1;
    return false;
  });

  unpairedOurs = unpairedOurs.filter((event) => {
    const pairIndex = unpairedTheirs.findIndex(
      (row) =>
        laDate(row.startTime) === laDate(event.startTime) &&
        Math.abs(Date.parse(row.startTime) - Date.parse(event.startTime)) <= TIME_MISMATCH_TOLERANCE_MS &&
        titlesCompatible(row.title, event.title),
    );
    if (pairIndex < 0) return true;
    const [row] = unpairedTheirs.splice(pairIndex, 1);
    timeMismatches.push({
      title: event.title,
      ourStartTime: event.startTime,
      scenefStartTime: row.startTime,
    });
    return false;
  });

  const titleMismatches: TitleMismatchRow[] = [];
  unpairedOurs = unpairedOurs.filter((event) => {
    const pairIndex = unpairedTheirs.findIndex(
      (row) => Date.parse(row.startTime) === Date.parse(event.startTime),
    );
    if (pairIndex < 0) return true;
    const [row] = unpairedTheirs.splice(pairIndex, 1);
    titleMismatches.push({
      startTime: event.startTime,
      ourTitle: event.title,
      scenefTitle: row.title,
    });
    return false;
  });

  return {
    matched,
    timeMismatches,
    titleMismatches,
    oursOnly: unpairedOurs.map((event) => ({ title: event.title, startTime: event.startTime })),
    scenefOnly: unpairedTheirs.map((showing) => ({
      title: showing.title,
      startTime: showing.startTime,
    })),
    collapsedDuplicates,
    excluded: {
      ours: ours.length - comparableOurs.length,
      scenef: theirs.length - comparableTheirs.length,
    },
  };
}
