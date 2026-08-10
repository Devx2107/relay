import {
  MAX_SCHEDULE_ATTENDEES,
  parseAgentIntent,
  type AgentIntent,
  type UserFacingError,
} from "./contracts";
import { applyScheduleDefaults, ScheduleOptionsError } from "../scheduling";

export type IntentParseResult =
  { ok: true; intent: AgentIntent } | { ok: false; error: UserFacingError };

const MAX_COMMAND_LENGTH = 2000;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function invalidRequest(message: string): IntentParseResult {
  return {
    ok: false,
    error: {
      code: "invalid_request",
      message,
      retryable: false,
    },
  };
}

function invalidError(message: string): UserFacingError {
  return {
    code: "invalid_request",
    message,
    retryable: false,
  };
}

function extractAttendees(input: string):
  | {
      attendees?: string[];
      unresolvedAttendees?: string[];
      attendeeStatus: "provided" | "missing" | "unresolved";
    }
  | { error: UserFacingError } {
  const emails = input.match(emailPattern)?.map((email) => email.toLowerCase()) ?? [];
  const unique = [...new Set(emails)];
  if (/\S+@\S+/.test(input) && unique.length === 0) {
    return { error: invalidError("I could not validate the attendee email address.") };
  }
  if (unique.length > MAX_SCHEDULE_ATTENDEES) {
    return {
      error: invalidError(
        `Please keep scheduling requests to ${MAX_SCHEDULE_ATTENDEES} attendees or fewer.`,
      ),
    };
  }

  const nameMatch = input.match(
    /\bwith\s+([^.!?]+?)(?=\s+(?:on|at|for|from|tomorrow|today|next|this|between)\b|[.!?]|$)/i,
  );
  const unresolved = nameMatch
    ? nameMatch[1]
        .split(/\s*(?:,|&|\band\b)\s*/i)
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && !name.includes("@"))
    : [];
  const attendingMatch = input.match(/\b([a-z][a-z\s.&-]{0,80}?)\s+will\s+be\s+attending\b/i);
  if (attendingMatch && unique.length === 0 && unresolved.length === 0) {
    unresolved.push(attendingMatch[1].trim());
  }
  if (unique.length === 0 && unresolved.length === 0) return { attendeeStatus: "missing" };
  if (unresolved.length > MAX_SCHEDULE_ATTENDEES) {
    return {
      error: invalidError(
        `Please keep scheduling requests to ${MAX_SCHEDULE_ATTENDEES} attendees or fewer.`,
      ),
    };
  }
  if (unresolved.length > 0) {
    return {
      attendees: unique.length > 0 ? unique : undefined,
      unresolvedAttendees: unresolved,
      attendeeStatus: "unresolved",
    };
  }
  return { attendees: unique, attendeeStatus: "provided" };
}

function triageSource(command: string): "email" | "calendar" | "all" {
  const hasCalendarTerms =
    /\b(calendar|calendars|event|events|meeting|meetings|schedule)\b/i.test(command) ||
    /\bwhat\s+do\s+i\s+have\s+for\s+(?:today|tomorrow|this\s+week|next\s+week)\b/i.test(command);
  const hasEmailTerms = /\b(email|emails|mail|inbox|inboxes|unread|thread|threads)\b/i.test(
    command,
  );

  if (hasCalendarTerms && !hasEmailTerms) return "calendar";
  if (hasEmailTerms && !hasCalendarTerms) return "email";
  return "all";
}

function triageLimit(command: string): number | undefined {
  const match = command.match(/\b(?:top|first|limit)\s+(\d{1,3})\b/i);
  if (!match) return undefined;
  const limit = Number(match[1]);
  return Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : undefined;
}

function isScheduleCommand(command: string): boolean {
  return /\b(schedule|schduele|schuele|scheduel|schedual|book|arrange|availability|available|find\s+(?:a\s+)?time|set\s+up)\b/i.test(
    command,
  );
}

export function requestsSchedulingClarification(command: string): boolean {
  return /\b(?:ask\s+me\s+(?:all\s+)?(?:the\s+)?requirements?|what\s+(?:details|information)\s+do\s+you\s+need|need\s+(?:more\s+)?(?:details|information))\b/i.test(
    command,
  );
}

export function hasScheduleTimeConstraint(command: string): boolean {
  return /\b(?:today|tomorrow|tonight|morning|afternoon|evening|next\s+week|next\s+month|on\s+\w+|from\s+\d|at\s+\d|between\s+\d|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.test(
    command,
  );
}

function extractScheduleDetails(input: string) {
  const location = input
    .match(
      /\b(?:at|in)\s+(.+?)(?=\s+and\s+(?:the\s+)?agenda\b|\s+agenda\b|\s+and\s+it\s+is\b|$)/i,
    )?.[1]
    ?.trim()
    .replace(/[,.]+$/, "");
  const agenda = input
    .match(
      /\bagenda\s*(?:is|:)?\s*(?:to\s+)?(.+?)(?=\s+and\s+(?:it\s+is\s+)?(?:a\s+)?(?:one[- ]off|recurring)\b|$)/i,
    )?.[1]
    ?.trim()
    .replace(/[.!?]+$/, "");
  const recurrence = /\b(?:one[- ]off|one time|single event)\b/i.test(input)
    ? "one_off"
    : /\brecurr(?:ing|ence)|every\s+(?:day|week|month)\b/i.test(input)
      ? "recurring"
      : undefined;
  const recurrenceMatch = input.match(
    /\bevery\s+(day|week|month)(?:\s+for\s+(\d{1,3})\s+(?:times?|occurrences?))?\b/i,
  );
  const recurrenceRule = recurrenceMatch
    ? `RRULE:FREQ=${recurrenceMatch[1].toUpperCase()}${recurrenceMatch[2] ? `;COUNT=${recurrenceMatch[2]}` : ""}`
    : undefined;
  const reminderMinutes = Number(
    input.match(/\b(?:remind|reminder)\s+(?:me\s+)?(\d{1,5})\s+minutes?\s+before\b/i)?.[1],
  );
  return {
    location,
    agenda,
    recurrence: recurrenceRule ? "recurring" : recurrence,
    recurrenceRule,
    reminderMinutes: Number.isInteger(reminderMinutes) ? reminderMinutes : undefined,
  };
}

export function isHelpCommand(command: string): boolean {
  return /^(?:help|help me|what can you do|what are your features|what are your capabilities|how can you help|what do you support)\??$/i.test(
    command.trim(),
  );
}

function scheduleIntent(command: string, accountTimeZone?: string): IntentParseResult {
  const attendees = extractAttendees(command);
  if ("error" in attendees) return { ok: false, error: attendees.error };
  let options;
  try {
    options = applyScheduleDefaults(command, accountTimeZone);
  } catch (error) {
    if (error instanceof ScheduleOptionsError) return invalidRequest(error.message);
    return invalidRequest("That scheduling request could not be normalized safely.");
  }
  return {
    ok: true,
    intent: parseAgentIntent({
      kind: "schedule",
      parameters: { request: command, ...attendees, ...extractScheduleDetails(command), options },
    }),
  };
}

function isTriageCommand(command: string, scheduling = false): boolean {
  if (scheduling) {
    return /\b(triage|inbox|unread|priorit(?:y|ies)|what\s+needs\s+attention|emails?|mail)\b/i.test(
      command,
    );
  }
  return (
    /\b(triage|inbox|unread|priorit(?:y|ies)|what\s+needs\s+attention|recent\s+(?:events?|meetings?)|upcoming\s+(?:events?|meetings?)|calendar|emails?|mail)\b/i.test(
      command,
    ) ||
    /\bwhat\s+do\s+i\s+have\s+for\s+(?:today|tomorrow|this\s+week|next\s+week)\b/i.test(
      command,
    ) ||
    /\b(?:cancel|reschedul\w*|move)\s+(?:(?:this|that|the)\s+)?(?:meeting|event)\b/i.test(command)
  );
}

function isUnsupportedAction(command: string): boolean {
  return /\b(send|reply|archive|delete|ignore|snooze)\b/i.test(command);
}

function calendarAction(command: string): "cancel" | "reschedule" | undefined {
  if (/\b(?:cancel|delete|remove)\s+(?:(?:this|that|the)\s+)?(?:meeting|event)\b/i.test(command)) {
    return "cancel";
  }
  if (/\b(?:reschedul\w*|move)\s+(?:(?:this|that|the)\s+)?(?:meeting|event)\b/i.test(command)) {
    return "reschedule";
  }
  return undefined;
}

function canInheritHistory(command: string): boolean {
  return /^(?:what|how)\s+about\b|^(?:make|change|move|use|set)\s+(?:it|that|this)\b|^(?:and|also|with|for|on|at|tomorrow|today|show|list|give|which|who|when)\b/i.test(
    command,
  );
}

export function parseCommand(
  input: unknown,
  history: { role: string; content: string }[] = [],
  options: { accountTimeZone?: string } = {},
): IntentParseResult {
  if (typeof input !== "string") {
    return invalidRequest("Enter a triage or scheduling request.");
  }

  const command = input.trim().replace(/\s+/g, " ");
  if (command.length === 0) return invalidRequest("Enter a triage or scheduling request.");
  if (command.length > MAX_COMMAND_LENGTH) {
    return invalidRequest(`Keep requests under ${MAX_COMMAND_LENGTH} characters.`);
  }

  const schedule = isScheduleCommand(command);
  if (!schedule && isUnsupportedAction(command)) {
    return invalidRequest("That action is not supported yet. Try asking for triage or scheduling.");
  }

  const triage = isTriageCommand(command, schedule);
  if (schedule && triage) {
    return invalidRequest("Please ask for triage or scheduling in one request, not both.");
  }

  try {
    if (schedule) {
      return scheduleIntent(command, options.accountTimeZone);
    }

    if (triage) {
      const action = calendarAction(command);
      return {
        ok: true,
        intent: parseAgentIntent({
          kind: "triage",
          parameters: {
            source: triageSource(command),
            limit: triageLimit(command),
            ...(action ? { calendarAction: action } : {}),
          },
        }),
      };
    }

    // Inherit only when the new command is phrased as a contextual follow-up.
    if (!canInheritHistory(command)) {
      return invalidRequest(
        "That request is not supported yet. Try asking for triage or scheduling.",
      );
    }
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === "user") {
        const prevParse = parseCommand(msg.content, []);
        if (prevParse.ok) {
          if (prevParse.intent.kind === "schedule") {
            return scheduleIntent(command, options.accountTimeZone);
          }
          if (prevParse.intent.kind === "triage") {
            return {
              ok: true,
              intent: parseAgentIntent({
                kind: "triage",
                parameters: {
                  source:
                    triageSource(command) === "all"
                      ? prevParse.intent.parameters.source
                      : triageSource(command),
                  limit: triageLimit(command) ?? prevParse.intent.parameters.limit,
                },
              }),
            };
          }
        }
      }
    }
  } catch {
    return invalidRequest(
      "That request could not be understood. Try asking for triage or scheduling.",
    );
  }

  return invalidRequest("That request is not supported yet. Try asking for triage or scheduling.");
}
