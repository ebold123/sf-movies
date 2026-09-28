export interface TheaterConfig {
  slug: string;
  name: string;
  baseUrl: string;
  source: "cinema-sf" | "roxie" | "scenef" | "tribe" | "bottom-of-the-hill" | "the-independent" | "live-nation";
  // Required when source is "scenef" — the venue id in SceneF's feed.
  venueId?: string;
  // This fork only scrapes and displays "music" venues (see scrape-music-venues.ts
  // and loadEvents.ts) — "movie" entries are kept, unscraped, so the original
  // repo's theaters stay easy to diff/merge against upstream.
  category: "movie" | "music";
}

// Cinema SF operates the Balboa, Vogue, and 4-Star on Squarespace sites that
// share one calendar format. Adding another of their venues here is the only
// change scrape-theater.ts needs to pick it up — no code changes required.
export const theaters: Record<string, TheaterConfig> = {
  balboa: {
    slug: "balboa",
    name: "Balboa",
    baseUrl: "https://www.balboamovies.com",
    source: "cinema-sf",
    category: "movie",
  },
  vogue: {
    slug: "vogue",
    name: "Vogue",
    baseUrl: "https://voguemovies.com",
    source: "cinema-sf",
    category: "movie",
  },
  "four-star": {
    slug: "four-star",
    name: "4-Star",
    baseUrl: "https://www.4-star-movies.com",
    source: "cinema-sf",
    category: "movie",
  },
  roxie: {
    slug: "roxie",
    name: "Roxie",
    baseUrl: "https://roxie.com",
    source: "roxie",
    category: "movie",
  },
  alamo: {
    slug: "alamo",
    name: "Alamo",
    baseUrl: "https://drafthouse.com/sf",
    source: "scenef",
    venueId: "alamo-new-mission",
    category: "movie",
  },
  ata: {
    slug: "ata",
    name: "ATA",
    baseUrl: "https://artiststelevisionaccess.org",
    source: "tribe",
    category: "movie",
  },
  "the-independent": {
    slug: "the-independent",
    name: "The Independent",
    baseUrl: "https://www.theindependentsf.com",
    source: "the-independent",
    category: "music",
  },
  "madrone-art-bar": {
    slug: "madrone-art-bar",
    name: "Madrone Art Bar",
    baseUrl: "https://madroneartbar.com",
    source: "tribe",
    category: "music",
  },
  "bottom-of-the-hill": {
    slug: "bottom-of-the-hill",
    name: "Bottom of the Hill",
    baseUrl: "https://bottomofthehill.com",
    source: "bottom-of-the-hill",
    category: "music",
  },
  fillmore: {
    slug: "fillmore",
    name: "The Fillmore",
    baseUrl: "https://www.thefillmore.com",
    source: "live-nation",
    category: "music",
  },
};

export function musicVenues(): TheaterConfig[] {
  return Object.values(theaters).filter((theater) => theater.category === "music");
}
