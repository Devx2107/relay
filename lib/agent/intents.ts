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
  const hasCalendarTerms = /\b(calendar|calendars|event|events|meeting|meetings|schedule)\b/i.test(
    command,
  );
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
  return /\b(schedule|book|arrange|availability|available|find\s+(?:a\s+)?time|set\s+up)\b/i.test(
    command,
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
      parameters: { request: command, ...attendees, options },
    }),
  };
}

function isTriageCommand(command: string, scheduling = false): boolean {
  if (scheduling) {
    return /\b(triage|inbox|unread|priorit(?:y|ies)|what\s+needs\s+attention|emails?|mail)\b/i.test(
      command,
    );
  }
  return /\b(triage|inbox|unread|priorit(?:y|ies)|what\s+needs\s+attention|upcoming\s+events?|calendar|emails?|mail)\b/i.test(
    command,
  );
}

function isUnsupportedAction(command: string): boolean {
  return /\b(send|reply|archive|delete|ignore|snooze|cancel)\b/i.test(command);
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
  if (isUnsupportedAction(command)) {
    return invalidRequest("That action is not supported yet. Try asking for triage or scheduling.");
  }

  const schedule = isScheduleCommand(command);
  const triage = isTriageCommand(command, schedule);
  if (schedule && triage) {
    return invalidRequest("Please ask for triage or scheduling in one request, not both.");
  }

  try {
    if (schedule) {
      return scheduleIntent(command, options.accountTimeZone);
    }

    if (triage) {
      return {
        ok: true,
        intent: parseAgentIntent({
          kind: "triage",
          parameters: { source: triageSource(command), limit: triageLimit(command) },
        }),
      };
    }

    // Attempt to inherit intent from history
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
