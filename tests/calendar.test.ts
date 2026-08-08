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
      data: { items: [{ id: "e1", summary: "Test event" }] }
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
      orderBy: "startTime"
    });
  });
  it("checkAvailability sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("googlecalendar", "api.calendar.getAvailability", {
      content: "Success",
      data: { calendars: { "alice@example.com": { busy: [] } } }
    });

    const timeMin = new Date("2026-08-08T00:00:00Z").toISOString();
    const timeMax = new Date("2026-08-08T23:59:59Z").toISOString();
    const result = await calendar.checkAvailability("tenant-456", timeMin, timeMax, ["alice@example.com"]);

    expect(result.content).toBe("Success");
    expect(result.data.calendars["alice@example.com"].busy).toEqual([]);

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-456");
    expect(calls[0].call.action).toBe("api.calendar.getAvailability");
    expect(calls[0].call.args).toEqual({ 
      timeMin, 
      timeMax,
      items: [{ id: "alice@example.com" }]
    });
  });
});
