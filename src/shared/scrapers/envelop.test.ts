import { describe, expect, it, vi } from "vitest";
import { fetchEnvelopEvents, parseEnvelopEvents } from "./envelop";

function page(events: object[]): string {
  const data = { props: { pageProps: { events } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const listen = {
  __id__: "ESF20261104-frank-ocean-channel-orange-listen",
  title: "Frank Ocean - Channel ORANGE : LISTEN",
  date: "2026-11-05T03:00:00.000Z",
  series: "cms-series/listen",
};
const dance = {
  __id__: "ESF20261128-daft-punk-ram-dance",
  title: "Daft Punk - Random Access Memories : DANCE",
  date: "2026-11-29T04:30:00.000Z",
  series: "cms-series/dance",
};

describe("parseEnvelopEvents", () => {
  it("keeps LISTEN events, converting the UTC instant to Pacific time", () => {
    expect(parseEnvelopEvents(page([listen]), "Envelop SF", "https://envelop.us")).toEqual([
      {
        theater: "Envelop SF",
        title: "Frank Ocean - Channel ORANGE : LISTEN",
        startTime: "2026-11-04T19:00:00-08:00",
        sourceUrl: "https://envelop.us/event/ESF20261104-frank-ocean-channel-orange-listen",
      },
    ]);
  });

  it("keeps DANCE events", () => {
    const events = parseEnvelopEvents(page([dance]), "Envelop SF", "https://envelop.us");
    expect(events.map((e) => e.title)).toEqual(["Daft Punk - Random Access Memories : DANCE"]);
    expect(events[0].startTime).toBe("2026-11-28T20:30:00-08:00");
  });

  it("drops every other series (live, workshop, yoga, other, ...)", () => {
    const others = ["live", "other", "workshop", "yoga", "sound", "sound-bath"].map((series) => ({
      ...listen,
      __id__: `x-${series}`,
      series: `cms-series/${series}`,
    }));
    expect(parseEnvelopEvents(page([...others, listen]), "Envelop SF", "https://envelop.us")).toHaveLength(1);
  });

  it("skips entries missing an id, title, valid date or series", () => {
    const broken = [
      { ...listen, __id__: undefined },
      { ...listen, title: undefined },
      { ...listen, date: "not a date" },
      { ...listen, date: undefined },
      { ...listen, series: undefined },
    ];
    expect(parseEnvelopEvents(page(broken), "Envelop SF", "https://envelop.us")).toEqual([]);
  });

  it("throws loudly when the page no longer carries its data, so the status page goes red", () => {
    expect(() => parseEnvelopEvents("<html></html>", "Envelop SF", "https://envelop.us")).toThrow(/__NEXT_DATA__/);
    const noEvents = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>`;
    expect(() => parseEnvelopEvents(noEvents, "Envelop SF", "https://envelop.us")).toThrow(/events list/);
  });
});

describe("fetchEnvelopEvents", () => {
  it("fetches /events and parses it", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, text: async () => page([listen, dance]) }) as Response);

    const events = await fetchEnvelopEvents("https://envelop.us", "Envelop SF", fetchFn);

    expect(fetchFn).toHaveBeenCalledWith("https://envelop.us/events");
    expect(events).toHaveLength(2);
  });

  it("throws on a non-OK response", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 503, text: async () => "" }) as Response);
    await expect(fetchEnvelopEvents("https://envelop.us", "Envelop SF", fetchFn)).rejects.toThrow(/503/);
  });
});
