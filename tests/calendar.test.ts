import { describe, expect, it, beforeEach } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { CalendarService } from "../lib/calendar";

describe("CalendarService", () => {
  let mockIntegration: MockIntegrationService;
  let calendar: CalendarService;

  beforeEach(() => {
    mockIntegration = new MockIntegrationService();
    calendar = new CalendarService(mockIntegration);
  });

  it("getUpcomingEvents sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("googlecalendar", "api.events.getMany", {
      content: "Success",
      data: { items: [{ id: "e1", summary: "Test event" }] },
    });

    const timeMin = new Date("2026-08-08T00:00:00Z").toISOString();
    const result = await calendar.getUpcomingEvents("tenant-123", timeMin, 5);

    expect(result.content).toBe("Success");
    expect(result.data.items[0].id).toBe("e1");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-123");
    expect(calls[0].call.plugin).toBe("googlecalendar");
    expect(calls[0].call.action).toBe("api.events.getMany");
    expect(calls[0].call.args).toEqual({
      timeMin,
      maxResults: 5,
      singleEvents: true,
      orderBy: "startTime",
    });
  });
  it("checkAvailability sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("googlecalendar", "api.calendar.getAvailability", {
      content: "Success",
      data: { calendars: { "alice@example.com": { busy: [] } } },
    });

    const timeMin = new Date("2026-08-08T00:00:00Z").toISOString();
    const timeMax = new Date("2026-08-08T23:59:59Z").toISOString();
    const result = await calendar.checkAvailability("tenant-456", timeMin, timeMax, [
      "alice@example.com",
    ]);

    expect(result.content).toBe("Success");
    expect(result.data.calendars["alice@example.com"].busy).toEqual([]);

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-456");
    expect(calls[0].call.action).toBe("api.calendar.getAvailability");
    expect(calls[0].call.args).toEqual({
      timeMin,
      timeMax,
      items: [{ id: "alice@example.com" }],
    });
  });

  it("createEvent sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("googlecalendar", "api.events.create", {
      content: "Success",
      data: { id: "e2" },
    });

    const start = new Date("2026-08-08T10:00:00Z").toISOString();
    const end = new Date("2026-08-08T11:00:00Z").toISOString();
    const result = await calendar.createEvent("tenant-123", "Sync", start, end, ["bob@test.com"]);

    expect(result.data.id).toBe("e2");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].call.action).toBe("api.events.create");
    expect(calls[0].call.args).toEqual({
      event: {
        summary: "Sync",
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: [{ email: "bob@test.com" }],
      },
    });
  });

  it("modifyEvent fetches and sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("googlecalendar", "api.events.get", {
      content: "Success",
      data: { id: "e3", summary: "Old Sync", attendees: [] },
    });
    mockIntegration.mockResponse("googlecalendar", "api.events.update", {
      content: "Success",
      data: { id: "e3", summary: "New Sync" },
    });

    const result = await calendar.modifyEvent("tenant-123", "e3", { summary: "New Sync" });
    expect(result.data.summary).toBe("New Sync");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(2);
    expect(calls[0].call.action).toBe("api.events.get");
    expect(calls[0].call.args).toEqual({ id: "e3" });

    expect(calls[1].call.action).toBe("api.events.update");
    expect(calls[1].call.args).toEqual({
      id: "e3",
      event: {
        id: "e3",
        summary: "New Sync",
        attendees: [],
      },
    });
  });
});
