import type { Event } from "../events/event";
import type { TheaterConfig } from "../theaters";
import { fetchRoxieEvents } from "./roxie";
import { fetchSceneFEvents } from "./scenef";
import { fetchCinemaSfEvents } from "./cinemaSf";
import { fetchTribeEvents } from "./tribeEvents";
import { fetchBottomOfTheHillEvents } from "./bottomOfTheHill";
import { fetchTheIndependentEvents } from "./theIndependent";
import { fetchLiveNationEvents } from "./livenation";

// The one entry point for "fetch this theater's upcoming events, live".
// Every script (the daily scrape, diagnostics) goes through this dispatch so
// they can never disagree about how a theater is scraped.
export function fetchEventsFor(theater: TheaterConfig): Promise<Event[]> {
  switch (theater.source) {
    case "cinema-sf":
      return fetchCinemaSfEvents(theater.baseUrl, theater.name);
    case "roxie":
      return fetchRoxieEvents(theater.baseUrl, theater.name);
    case "scenef":
      if (!theater.venueId) {
        throw new Error(`Theater "${theater.slug}" has source "scenef" but no venueId configured`);
      }
      return fetchSceneFEvents(theater.venueId, theater.name);
    case "tribe":
      return fetchTribeEvents(theater.baseUrl, theater.name);
    case "bottom-of-the-hill":
      return fetchBottomOfTheHillEvents(theater.baseUrl, theater.name);
    case "the-independent":
      return fetchTheIndependentEvents(theater.baseUrl, theater.name);
    case "live-nation":
      return fetchLiveNationEvents(theater.baseUrl, theater.name);
  }
}
