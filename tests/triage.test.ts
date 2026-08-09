import { beforeEach, describe, expect, it } from "vitest";
import { CalendarService } from "../lib/calendar";
import { GmailService } from "../lib/gmail";
import { MockIntegrationService } from "../lib/integration-mock";
import { TriageInputService } from "../lib/triage";

describe("TriageInputService", () => {
  let integration: MockIntegrationService;
  let service: TriageInputService;

  beforeEach(() => {
    integration = new MockIntegrationService();
    service = new TriageInputService(
      new GmailService(integration),
      new CalendarService(integration),
    );
  });

  it("retrieves recent email and upcoming calendar events with stable defaults", async () => {
    integration.mockResponse("gmail", "api.threads.list", {
      content: "Success",
      data: { threads: [{ id: "thread-1" }] },
    });
    integration.mockResponse("googlecalendar", "api.events.getMany", {
      content: "Success",
      data: { items: [{ id: "event-1" }] },
    });

    const result = await service.retrieve("tenant-123", {
      now: () => new Date("2026-08-09T10:00:00.000Z"),
    });

    expect(result.email.data).toEqual({ threads: [{ id: "thread-1" }] });
    expect(result.calendar.data).toEqual({ items: [{ id: "event-1" }] });
    expect(result.email.error).toBeUndefined();
    expect(result.calendar.error).toBeUndefined();

    expect(integration.getCalls().map(({ tenantId, call }) => ({ tenantId, call }))).toEqual([
      {
        tenantId: "tenant-123",
        call: {
          plugin: "gmail",
          action: "api.threads.list",
          args: { q: "in:inbox", maxResults: 10 },
        },
      },
      {
        tenantId: "tenant-123",
        call: {
          plugin: "googlecalendar",
          action: "api.events.getMany",
          args: {
            timeMin: "2026-08-09T10:00:00.000Z",
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
          },
        },
      },
    ]);
  });

  it("returns a safe source failure while preserving the other source", async () => {
    integration.mockResponse("gmail", "api.threads.list", {
      content: "",
      error: "provider token should not be exposed",
      isAuthMissing: true,
    });
    integration.mockResponse("googlecalendar", "api.events.getMany", {
      content: "Success",
      data: { items: [{ id: "event-1" }] },
    });

    const result = await service.retrieve("tenant-123", {
      timeMin: "2026-08-09T10:00:00.000Z",
    });

    expect(result.email).toEqual({
      error: {
        source: "email",
        code: "authentication_required",
        message: "Reconnect Gmail to continue.",
        retryable: false,
      },
    });
    expect(result.calendar.data).toEqual({ items: [{ id: "event-1" }] });
    expect(JSON.stringify(result)).not.toContain("provider token");
  });

  it("maps rate limits and uses explicit limits", async () => {
    integration.mockResponse("gmail", "api.threads.list", {
      content: "",
      error: "rate limited",
      isRateLimited: true,
    });
    integration.mockResponse("googlecalendar", "api.events.getMany", {
      content: "Success",
      data: { items: [] },
    });

    const result = await service.retrieve("tenant-123", {
      emailLimit: 4,
      calendarLimit: 3,
      timeMin: "2026-08-09T12:00:00.000Z",
    });

    expect(result.email.error).toMatchObject({
      source: "email",
      code: "rate_limited",
      retryable: true,
    });
    expect(integration.getCalls()[0].call.args).toEqual({ q: "in:inbox", maxResults: 4 });
    expect(integration.getCalls()[1].call.args).toMatchObject({
      timeMin: "2026-08-09T12:00:00.000Z",
      maxResults: 3,
    });
  });
});
