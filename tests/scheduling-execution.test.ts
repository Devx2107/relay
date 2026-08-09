import { describe, expect, it } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { ToolRegistry } from "../lib/agent/tools";
import {
  calendarCreateArgs,
  emailSendArgs,
  executeSchedulingProposal,
  parseStoredSchedulingProposal,
} from "../lib/scheduling-execution";

const proposal = {
  kind: "schedule_proposal" as const,
  version: 1 as const,
  event: {
    summary: "Project kickoff",
    start: "2026-08-10T04:00:00.000Z",
    end: "2026-08-10T04:30:00.000Z",
    timeZone: "Asia/Kolkata",
    durationMinutes: 30,
    meetingProvider: "google_meet" as const,
    calendarId: "primary" as const,
  },
  invitation: { attendees: ["alice@example.com"] },
  alternatives: [
    {
      start: "2026-08-10T05:00:00.000Z",
      end: "2026-08-10T05:30:00.000Z",
      timeZone: "Asia/Kolkata",
      durationMinutes: 30,
      rank: 2,
      reason: "Available for all attendees." as const,
    },
  ],
  email: {
    to: ["alice@example.com"],
    subject: "Project kickoff",
    body: "Please join the meeting.",
  },
};

function makeRegistry() {
  const integration = new MockIntegrationService();
  integration.mockResponse("googlecalendar", "api.events.create", {
    content: "Created",
    data: { id: "event-1", htmlLink: "https://calendar.example/event-1" },
  });
  integration.mockResponse("gmail", "api.messages.send", {
    content: "Sent",
    data: { id: "message-1" },
  });
  return { integration, registry: new ToolRegistry(integration) };
}

describe("scheduling execution", () => {
  it("validates stored proposals and builds provider-safe event args", () => {
    const parsed = parseStoredSchedulingProposal(proposal);
    expect(calendarCreateArgs(parsed, "run-1:google-meet")).toEqual({
      calendarId: "primary",
      event: {
        summary: "Project kickoff",
        start: { dateTime: proposal.event.start, timeZone: "Asia/Kolkata" },
        end: { dateTime: proposal.event.end, timeZone: "Asia/Kolkata" },
        attendees: [{ email: "alice@example.com" }],
        conferenceData: {
          createRequest: {
            requestId: "run-1:google-meet",
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
      sendUpdates: "all",
      conferenceDataVersion: 1,
    });
  });

  it("creates the event before sending optional email and verifies both IDs", async () => {
    const { integration, registry } = makeRegistry();
    const result = await executeSchedulingProposal(registry, "tenant-1", proposal, "run-1");

    expect(result).toEqual({
      ok: true,
      summary: {
        eventId: "event-1",
        eventLink: "https://calendar.example/event-1",
        emailMessageId: "message-1",
      },
    });
    expect(integration.getCalls().map(({ call }) => `${call.plugin}:${call.action}`)).toEqual([
      "googlecalendar:api.events.create",
      "gmail:api.messages.send",
    ]);
  });

  it("does not send email when event creation fails", async () => {
    const { integration, registry } = makeRegistry();
    integration.mockResponse("googlecalendar", "api.events.create", {
      content: "",
      error: "provider details",
    });

    const result = await executeSchedulingProposal(registry, "tenant-1", proposal, "run-2");

    expect(result).toMatchObject({ ok: false, error: { code: "integration_unavailable" } });
    expect(integration.getCalls()).toHaveLength(1);
  });

  it("reports partial execution when optional email fails after event creation", async () => {
    const { integration, registry } = makeRegistry();
    integration.mockResponse("gmail", "api.messages.send", {
      content: "",
      error: "provider details",
    });

    const result = await executeSchedulingProposal(registry, "tenant-1", proposal, "run-3");

    expect(result).toMatchObject({
      ok: false,
      partial: { eventId: "event-1" },
      error: { code: "integration_unavailable" },
    });
  });

  it("rejects malformed proposals before provider execution", async () => {
    const { integration, registry } = makeRegistry();
    expect(() =>
      parseStoredSchedulingProposal({
        ...proposal,
        event: { ...proposal.event, calendarId: "other" },
      }),
    ).toThrow(/invalid/);
    const args = emailSendArgs(parseStoredSchedulingProposal(proposal));
    expect(args?.raw).toBeTruthy();
    expect(integration.getCalls()).toHaveLength(0);
    expect(registry).toBeDefined();
  });
});
