import { SCHEDULE_EMAIL_PATTERN, isValidTimeZone } from "./agent/contracts";
import type { AgentToolResult, UserFacingError } from "./agent/contracts";
import type { ToolRegistry } from "./agent/tools";
import type { SchedulingProposal } from "./scheduling-proposal";

const MAX_ATTENDEES = 20;
const MAX_ALTERNATIVES = 2;

export class SchedulingExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingExecutionError";
  }
}

export interface SchedulingExecutionSummary {
  eventId: string;
  eventLink?: string;
  emailMessageId?: string;
}

export interface SchedulingExecutionOutcome {
  ok: boolean;
  summary?: SchedulingExecutionSummary;
  error?: UserFacingError;
  partial?: { eventId: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new SchedulingExecutionError(`The scheduling proposal has an invalid ${field}.`);
  }
  return value.trim();
}

function validRecipients(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ATTENDEES &&
    new Set(value).size === value.length &&
    value.every(
      (email) =>
        typeof email === "string" &&
        email === email.toLowerCase() &&
        SCHEDULE_EMAIL_PATTERN.test(email),
    )
  );
}

function validateSlot(value: unknown, timeZone: string, durationMinutes: number) {
  if (!isRecord(value)) throw new SchedulingExecutionError("The scheduling slot is invalid.");
  const start = requiredString(value.start, "slot start", 80);
  const end = requiredString(value.end, "slot end", 80);
  const rank = value.rank;
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    value.timeZone !== timeZone ||
    value.durationMinutes !== durationMinutes ||
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    value.reason !== "Available for all attendees."
  ) {
    throw new SchedulingExecutionError("The scheduling slot is invalid.");
  }
  return {
    start,
    end,
    timeZone,
    durationMinutes,
    rank,
    reason: "Available for all attendees." as const,
  };
}

/** Revalidates untrusted JSON loaded from agent_runs before any provider write. */
export function parseStoredSchedulingProposal(value: unknown): SchedulingProposal {
  if (!isRecord(value) || value.kind !== "schedule_proposal" || value.version !== 1) {
    throw new SchedulingExecutionError("The scheduling proposal is invalid.");
  }
  const event = value.event;
  const invitation = value.invitation;
  if (!isRecord(event) || !isRecord(invitation) || !validRecipients(invitation.attendees)) {
    throw new SchedulingExecutionError("The scheduling proposal is invalid.");
  }

  const summary = requiredString(event.summary, "meeting title", 120);
  const start = requiredString(event.start, "event start", 80);
  const end = requiredString(event.end, "event end", 80);
  const timeZone = requiredString(event.timeZone, "timezone", 100);
  const durationMinutes = event.durationMinutes;
  const location = event.location;
  const description = event.description;
  const recurrence = event.recurrence;
  const recurrenceRule = event.recurrenceRule;
  const reminderMinutes = event.reminderMinutes;
  const rankValues = value.alternatives;
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start) ||
    !isValidTimeZone(timeZone) ||
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480 ||
    event.meetingProvider !== "google_meet" ||
    event.calendarId !== "primary"
  ) {
    throw new SchedulingExecutionError("The scheduling proposal is invalid.");
  }
  if (
    (location !== undefined &&
      (typeof location !== "string" || location.trim().length === 0 || location.length > 200)) ||
    (description !== undefined &&
      (typeof description !== "string" ||
        description.trim().length === 0 ||
        description.length > 2000)) ||
    (recurrence !== undefined && recurrence !== "one_off" && recurrence !== "recurring") ||
    (recurrenceRule !== undefined &&
      (typeof recurrenceRule !== "string" ||
        !/^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)(?:;COUNT=\d{1,3})?$/.test(recurrenceRule))) ||
    (reminderMinutes !== undefined &&
      (!Number.isInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 40320))
  ) {
    throw new SchedulingExecutionError("The scheduling proposal has invalid event details.");
  }

  if (!Array.isArray(rankValues) || rankValues.length > MAX_ALTERNATIVES) {
    throw new SchedulingExecutionError("The scheduling alternatives are invalid.");
  }
  const alternatives = rankValues.map((slot) => validateSlot(slot, timeZone, durationMinutes));
  const email = value.email;
  let optionalEmail: SchedulingProposal["email"];
  if (email !== undefined) {
    if (
      !isRecord(email) ||
      !validRecipients(email.to) ||
      typeof email.subject !== "string" ||
      email.subject.trim().length === 0 ||
      email.subject.length > 160 ||
      /[\r\n]/.test(email.subject) ||
      typeof email.body !== "string" ||
      email.body.trim().length === 0 ||
      email.body.length > 2000
    ) {
      throw new SchedulingExecutionError("The optional email content is invalid.");
    }
    optionalEmail = {
      to: [...email.to],
      subject: email.subject.trim(),
      body: email.body.trim(),
    };
  }

  return {
    kind: "schedule_proposal",
    version: 1,
    event: {
      summary,
      start,
      end,
      timeZone,
      durationMinutes,
      meetingProvider: "google_meet",
      calendarId: "primary",
      ...(location ? { location: location.trim() } : {}),
      ...(description ? { description: description.trim() } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(recurrenceRule ? { recurrenceRule } : {}),
      ...(reminderMinutes !== undefined ? { reminderMinutes } : {}),
    },
    invitation: { attendees: [...invitation.attendees] },
    alternatives,
    ...(optionalEmail ? { email: optionalEmail } : {}),
  };
}

export function calendarCreateArgs(proposal: SchedulingProposal, requestId: string) {
  return {
    calendarId: proposal.event.calendarId,
    event: {
      summary: proposal.event.summary,
      start: { dateTime: proposal.event.start, timeZone: proposal.event.timeZone },
      end: { dateTime: proposal.event.end, timeZone: proposal.event.timeZone },
      ...(proposal.event.location ? { location: proposal.event.location } : {}),
      ...(proposal.event.description ? { description: proposal.event.description } : {}),
      ...(proposal.event.recurrenceRule ? { recurrence: [proposal.event.recurrenceRule] } : {}),
      ...(proposal.event.reminderMinutes !== undefined
        ? {
            reminders: {
              useDefault: false,
              overrides: [{ method: "popup", minutes: proposal.event.reminderMinutes }],
            },
          }
        : {}),
      attendees: proposal.invitation.attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
    sendUpdates: "all" as const,
    conferenceDataVersion: 1,
  };
}

export function emailSendArgs(proposal: SchedulingProposal) {
  if (!proposal.email) return undefined;
  const raw = [
    `To: ${proposal.email.to.join(", ")}`,
    `Subject: ${proposal.email.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    proposal.email.body,
  ].join("\r\n");
  return { raw: Buffer.from(raw, "utf8").toString("base64url") };
}

function providerId(result: AgentToolResult, field: string): string {
  const data = result.data;
  if (isRecord(data) && typeof data.id === "string" && data.id.length > 0) return data.id;
  throw new SchedulingExecutionError(`The created ${field} could not be verified.`);
}

function providerLink(result: AgentToolResult): string | undefined {
  const data = result.data;
  return isRecord(data) && typeof data.htmlLink === "string" ? data.htmlLink : undefined;
}

function organizerEmail(value: Record<string, unknown>): string | undefined {
  const organizer = value.organizer;
  if (!isRecord(organizer) || typeof organizer.email !== "string") return undefined;
  return SCHEDULE_EMAIL_PATTERN.test(organizer.email) ? organizer.email.toLowerCase() : undefined;
}

function googleEventLink(eventId: string, organizer: string): string {
  const eid = Buffer.from(`${eventId} ${organizer}`, "utf8").toString("base64url");
  return `https://www.google.com/calendar/event?eid=${eid}`;
}

function verifiedEventData(result: AgentToolResult): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data) || typeof result.data.id !== "string") {
    throw new SchedulingExecutionError("The created calendar event could not be read back.");
  }
  return result.data;
}

function safeProviderError(message: string): UserFacingError {
  return { code: "integration_unavailable", message, retryable: true, action: "retry" };
}

export async function executeSchedulingProposal(
  registry: ToolRegistry,
  tenantId: string,
  storedProposal: unknown,
  runId: string,
): Promise<SchedulingExecutionOutcome> {
  const proposal = parseStoredSchedulingProposal(storedProposal);
  const eventResult = await registry.execute(
    {
      id: `${runId}:calendar`,
      tenantId,
      toolId: "calendar.create_event",
      operation: "write",
      args: calendarCreateArgs(proposal, `${runId}:google-meet`),
    },
    true,
  );
  if (!eventResult.ok) {
    return {
      ok: false,
      error: eventResult.error ?? safeProviderError("The calendar event could not be created."),
    };
  }

  let eventId: string;
  try {
    eventId = providerId(eventResult, "calendar event");
  } catch {
    return { ok: false, error: safeProviderError("The calendar event could not be verified.") };
  }
  const verificationResult = await registry.execute({
    id: `${runId}:calendar-verification`,
    tenantId,
    toolId: "calendar.get_event",
    operation: "read",
    args: { calendarId: proposal.event.calendarId, id: eventId },
  });
  let verifiedEvent: Record<string, unknown>;
  try {
    verifiedEvent = verifiedEventData(verificationResult);
  } catch {
    return {
      ok: false,
      partial: { eventId },
      error: safeProviderError(
        "The calendar event was created but could not be read back for verification.",
      ),
    };
  }
  const summary: SchedulingExecutionSummary = {
    eventId,
    eventLink: organizerEmail(verifiedEvent)
      ? googleEventLink(eventId, organizerEmail(verifiedEvent) as string)
      : providerLink(eventResult),
  };

  const emailArgs = emailSendArgs(proposal);
  if (emailArgs) {
    const emailResult = await registry.execute(
      {
        id: `${runId}:email`,
        tenantId,
        toolId: "gmail.send",
        operation: "write",
        args: emailArgs,
      },
      true,
    );
    if (!emailResult.ok) {
      return {
        ok: false,
        partial: { eventId },
        error:
          emailResult.error ??
          safeProviderError("The event was created, but the email could not be sent."),
      };
    }
    try {
      summary.emailMessageId = providerId(emailResult, "invitation email");
    } catch {
      return {
        ok: false,
        partial: { eventId },
        error: safeProviderError(
          "The event was created, but the invitation email could not be verified.",
        ),
      };
    }
  }

  return { ok: true, summary };
}
