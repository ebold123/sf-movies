import { describe, expect, it, vi } from "vitest";
import { fetchCarbonhouseEvents, parseCarbonhousePage } from "./carbonhouse";

function entry({
  title,
  support = "",
  date,
  time,
  status = "Buy Tickets",
  detailUrl,
}: {
  title: string;
  support?: string;
  date: string;
  time: string;
  status?: string;
  detailUrl: string;
}): string {
  return `
    <div class="entry warfield clearfix">
      <div class="info">
        <div class="title">
          <h5 class="accentColor animated">Presenter</h5>
          <h3 class="carousel_item_title_small">
            <a href="${detailUrl}" title="More Info">${title}</a>
          </h3>
          ${support ? `<h4 class="animated">${support}</h4>` : ""}
        </div>
        <div class="date-time-container">
          <span class="date"><span class="fa fa-calendar-o"></span>${date}</span>
          <span class="time"><span class="fa fa-clock-o"></span>Show ${time}</span>
        </div>
      </div>
      <div class="buttons">
        <a href="https://www.axs.com/events/x" title="${status}" target="_blank" class="btn-tickets tickets">Tickets</a>
      </div>
    </div>
  `;
}

describe("parseCarbonhousePage", () => {
  it("extracts title, support act, date and time from a listing entry", () => {
    const html = entry({
      title: "LUCKI",
      support: "with Sk8star",
      date: "Mon, Sep 28, 2026",
      time: "8:00 PM",
      detailUrl: "https://www.thewarfieldtheatre.com/events/detail/1464613",
    });

    expect(parseCarbonhousePage(html, "The Warfield")).toEqual([
      {
        theater: "The Warfield",
        title: "LUCKI",
        startTime: "2026-09-28T20:00:00-07:00",
        sourceUrl: "https://www.thewarfieldtheatre.com/events/detail/1464613",
        synopsis: "with Sk8star",
      },
    ]);
  });

  it("skips cancelled shows but keeps sold-out ones", () => {
    const html =
      entry({
        title: "Cancelled Band",
        date: "Tue, Sep 29, 2026",
        time: "7:00 PM",
        status: "Cancelled",
        detailUrl: "https://www.thewarfieldtheatre.com/events/detail/1",
      }) +
      entry({
        title: "Sold Out Band",
        date: "Wed, Sep 30, 2026",
        time: "7:30 PM",
        status: "Sold Out",
        detailUrl: "https://www.thewarfieldtheatre.com/events/detail/2",
      });

    const events = parseCarbonhousePage(html, "The Warfield");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Sold Out Band");
  });

  it("defaults to 8pm when no time is found, and omits synopsis with no support act", () => {
    const html = `
      <div class="entry warfield clearfix">
        <div class="info">
          <div class="title">
            <h3 class="carousel_item_title_small">
              <a href="https://www.thewarfieldtheatre.com/events/detail/3" title="More Info">Solo Act</a>
            </h3>
          </div>
          <div class="date-time-container">
            <span class="date"><span class="fa fa-calendar-o"></span>Sat, Oct 10, 2026</span>
          </div>
        </div>
        <div class="buttons">
          <a href="https://www.axs.com/events/x" title="Buy Tickets" target="_blank" class="btn-tickets tickets">Tickets</a>
        </div>
      </div>
    `;

    expect(parseCarbonhousePage(html, "The Warfield")).toEqual([
      {
        theater: "The Warfield",
        title: "Solo Act",
        startTime: "2026-10-10T20:00:00-07:00",
        sourceUrl: "https://www.thewarfieldtheatre.com/events/detail/3",
      },
    ]);
  });
});

describe("fetchCarbonhouseEvents", () => {
  it("fetches the venue's /events/all page and parses it", async () => {
    const html = entry({
      title: "LUCKI",
      date: "Mon, Sep 28, 2026",
      time: "8:00 PM",
      detailUrl: "https://www.thewarfieldtheatre.com/events/detail/1464613",
    });
    const fetchFn = vi.fn(async () => ({ text: async () => html }) as Response);

    const events = await fetchCarbonhouseEvents(
      "https://www.thewarfieldtheatre.com",
      "The Warfield",
      fetchFn,
    );

    expect(fetchFn).toHaveBeenCalledWith("https://www.thewarfieldtheatre.com/events/all");
    expect(events).toEqual(parseCarbonhousePage(html, "The Warfield"));
  });
});
