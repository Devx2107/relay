import { isValidTimeZone, SCHEDULE_EMAIL_PATTERN } from "./agent/contracts";
import type { ScheduleIntent } from "./agent/contracts";
import type { AvailableSlot } from "./scheduling-availability";

const MAX_TITLE_LENGTH = 120;
const MAX_EMAIL_SUBJECT_LENGTH = 160;
const MAX_EMAIL_BODY_LENGTH = 2000;

export interface OptionalScheduleEmail {
  to: string[];
  subject: string;
  body: string;
}

export interface SchedulingProposal {
  kind: "schedule_proposal";
  version: 1;
  event: {
    summary: string;
    start: string;
    end: string;
    timeZone: string;
    durationMinutes: number;
    meetingProvider: ScheduleIntent["parameters"]["options"]["meetingProvider"];
    calendarId: ScheduleIntent["parameters"]["options"]["calendarId"];
    location?: string;
    description?: string;
    recurrence?: "one_off" | "recurring";
    recurrenceRule?: string;
    reminderMinutes?: number;
  };
  invitation: {
    attendees: string[];
  };
  alternatives: AvailableSlot[];
  email?: OptionalScheduleEmail;
}

export class SchedulingProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingProposalError";
  }
}

function validateEmails(emails: unknown, field: string): string[] {
  if (
    !Array.isArray(emails) ||
    emails.length === 0 ||
    emails.length > 20 ||
    emails.some(
      (email) =>
        typeof email !== "string" ||
        email !== email.toLowerCase() ||
        !SCHEDULE_EMAIL_PATTERN.test(email),
    )
  ) {
    throw new SchedulingProposalError(`${field} contains invalid recipients.`);
  }
  const unique = [...new Set(emails)];
  if (unique.length !== emails.length) {
    throw new SchedulingProposalError(`${field} contains duplicate recipients.`);
  }
  return unique;
}

function titleFromRequest(request: string): string {
  const explicit = request.match(
    /\b(?:called|titled|about|regarding)\s+(.+?)(?=\s+(?:with|for|on|at|from|between)\s+|$)/i,
  )?.[1];
  const title = (explicit || "Meeting").trim().replace(/[.!?]+$/, "");
  return title.slice(0, MAX_TITLE_LENGTH) || "Meeting";
}

function validateSlot(slot: AvailableSlot, expectedTimeZone: string, duration: number) {
  if (
    !slot ||
    typeof slot.start !== "string" ||
    typeof slot.end !== "string" ||
    !Number.isFinite(Date.parse(slot.start)) ||
    !Number.isFinite(Date.parse(slot.end)) ||
    Date.parse(slot.end) <= Date.parse(slot.start) ||
    slot.timeZone !== expectedTimeZone ||
    slot.durationMinutes !== duration ||
    !isValidTimeZone(slot.timeZone)
  ) {
    throw new SchedulingProposalError("The selected availability slot is invalid.");
  }
}

export function buildSchedulingProposal(
  intent: ScheduleIntent,
  slots: AvailableSlot[],
  email?: OptionalScheduleEmail,
): SchedulingProposal {
  const attendees = intent.parameters.attendees;
  const options = intent.parameters.options;
  if (intent.parameters.attendeeStatus === "unresolved") {
    throw new SchedulingProposalError("All attendee email addresses must be resolved first.");
  }
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > 3) {
    throw new SchedulingProposalError("At least one verified availability slot is required.");
  }
  if (!isValidTimeZone(options.timeZone)) {
    throw new SchedulingProposalError("The scheduling timezone is invalid.");
  }

  const selected = slots[0];
  validateSlot(selected, options.timeZone, options.durationMinutes);
  for (const slot of slots.slice(1)) validateSlot(slot, options.timeZone, options.durationMinutes);

  let validatedEmail: OptionalScheduleEmail | undefined;
  if (email !== undefined) {
    const to = validateEmails(email.to, "Email recipients");
    if (
      typeof email.subject !== "string" ||
      email.subject.trim().length === 0 ||
      email.subject.length > MAX_EMAIL_SUBJECT_LENGTH ||
      typeof email.body !== "string" ||
      email.body.trim().length === 0 ||
      email.body.length > MAX_EMAIL_BODY_LENGTH
    ) {
      throw new SchedulingProposalError("The optional email content is invalid.");
    }
    validatedEmail = { to, subject: email.subject.trim(), body: email.body.trim() };
  }

  return {
    kind: "schedule_proposal",
    version: 1,
    event: {
      summary: titleFromRequest(intent.parameters.request),
      start: selected.start,
      end: selected.end,
      timeZone: options.timeZone,
      durationMinutes: options.durationMinutes,
      meetingProvider: options.meetingProvider,
      calendarId: options.calendarId,
      ...(intent.parameters.location ? { location: intent.parameters.location } : {}),
      ...(intent.parameters.agenda ? { description: intent.parameters.agenda } : {}),
      ...(intent.parameters.recurrence ? { recurrence: intent.parameters.recurrence } : {}),
      ...(intent.parameters.recurrenceRule
        ? { recurrenceRule: intent.parameters.recurrenceRule }
        : {}),
      ...(intent.parameters.reminderMinutes !== undefined
        ? { reminderMinutes: intent.parameters.reminderMinutes }
        : {}),
    },
    invitation: { attendees: [...(attendees ?? [])] },
    alternatives: slots.slice(1).map((slot) => ({ ...slot })),
    ...(validatedEmail ? { email: validatedEmail } : {}),
  };
}
