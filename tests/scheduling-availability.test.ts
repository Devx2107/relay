import { describe, expect, it } from "vitest";
import {
  AvailabilityDataError,
  findAvailableSlots,
  type CalendarAvailabilityPayload,
} from "../lib/scheduling-availability";
import { parseExplicitScheduleWindow } from "../lib/scheduling";

const request = {
  attendees: ["alice@example.com"],
  windowStart: "2026-08-10T09:00:00.000Z",
  windowEnd: "2026-08-10T18:00:00.000Z",
  durationMinutes: 60,
  timeZone: "UTC",
};

function payload(busy: Array<{ start: string; end: string }> = []): CalendarAvailabilityPayload {
  return { calendars: { "alice@example.com": { busy } } };
}

describe("scheduling availability", () => {
  it("parses an explicit same-day local time window", () => {
    expect(
      parseExplicitScheduleWindow(
        "Schedule a meeting from 3 to 4 pm for today",
        "Asia/Kolkata",
        new Date("2026-08-10T04:00:00.000Z"),
      ),
    ).toEqual({
      timeMin: "2026-08-10T09:30:00.000Z",
      timeMax: "2026-08-10T10:30:00.000Z",
    });
  });

  it("returns the earliest three verified weekday slots", () => {
    const slots = findAvailableSlots(request, payload());

    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.start)).toEqual([
      "2026-08-10T09:00:00.000Z",
      "2026-08-10T09:30:00.000Z",
      "2026-08-10T10:00:00.000Z",
    ]);
    expect(slots[0]).toMatchObject({
      end: "2026-08-10T10:00:00.000Z",
      timeZone: "UTC",
      durationMinutes: 60,
      rank: 1,
      reason: "Available for all attendees.",
    });
  });

  it("blocks overlaps for any attendee but allows boundary-touching slots", () => {
    const slots = findAvailableSlots(
      request,
      payload([{ start: "2026-08-10T10:00:00.000Z", end: "2026-08-10T11:00:00.000Z" }]),
    );

    expect(slots[0].start).toBe("2026-08-10T09:00:00.000Z");
    expect(slots[1].start).toBe("2026-08-10T11:00:00.000Z");
  });

  it("requires every attendee calendar and merges overlapping busy intervals", () => {
    const slots = findAvailableSlots(
      { ...request, attendees: ["alice@example.com", "bob@example.com"] },
      {
        calendars: {
          "alice@example.com": {
            busy: [
              { start: "2026-08-10T09:00:00.000Z", end: "2026-08-10T10:00:00.000Z" },
              { start: "2026-08-10T09:30:00.000Z", end: "2026-08-10T11:00:00.000Z" },
            ],
          },
          "bob@example.com": { busy: [] },
        },
      },
    );

    expect(slots[0].start).toBe("2026-08-10T11:00:00.000Z");
  });

  it("excludes weekends and out-of-hours candidates", () => {
    const slots = findAvailableSlots(
      {
        ...request,
        windowStart: "2026-08-08T00:00:00.000Z",
        windowEnd: "2026-08-10T23:59:00.000Z",
        durationMinutes: 480,
      },
      payload(),
    );

    expect(slots).toHaveLength(1);
    expect(slots[0].start).toBe("2026-08-10T09:00:00.000Z");
  });

  it("honors an explicit evening window outside default work hours", () => {
    const slots = findAvailableSlots(
      {
        ...request,
        windowStart: "2026-08-10T19:00:00.000Z",
        windowEnd: "2026-08-10T20:00:00.000Z",
        durationMinutes: 60,
        allowOutsideWorkday: true,
      },
      payload(),
    );

    expect(slots[0].start).toBe("2026-08-10T19:00:00.000Z");
  });

  it("fails closed for invalid windows or malformed availability", () => {
    expect(() =>
      findAvailableSlots({ ...request, windowEnd: request.windowStart }, payload()),
    ).toThrow(AvailabilityDataError);
    expect(() =>
      findAvailableSlots(request, payload([{ start: "not-a-date", end: request.windowEnd }])),
    ).toThrow(AvailabilityDataError);
    expect(() =>
      findAvailableSlots(request, {
        calendars: { "alice@example.com": { busy: [], errors: [{ reason: "notFound" }] } },
      }),
    ).toThrow(/unavailable/);
    expect(() => findAvailableSlots(request, { calendars: {} })).toThrow(/incomplete/);
  });
});
