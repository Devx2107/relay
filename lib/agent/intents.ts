import { parseAgentIntent, type AgentIntent, type UserFacingError } from "./contracts";

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

function uniqueEmails(input: string): string[] | undefined {
  const emails = input.match(emailPattern)?.map((email) => email.toLowerCase()) ?? [];
  const unique = [...new Set(emails)];
  return unique.length > 0 ? unique : undefined;
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

function isTriageCommand(command: string): boolean {
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
  const triage = isTriageCommand(command);
  if (schedule && triage) {
    return invalidRequest("Please ask for triage or scheduling in one request, not both.");
  }

  try {
    if (schedule) {
      return {
        ok: true,
        intent: parseAgentIntent({
          kind: "schedule",
          parameters: { request: command, attendees: uniqueEmails(command) },
        }),
      };
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
            return {
              ok: true,
              intent: parseAgentIntent({
                kind: "schedule",
                parameters: { request: command, attendees: uniqueEmails(command) },
              }),
            };
          }
          if (prevParse.intent.kind === "triage") {
            return {
              ok: true,
              intent: parseAgentIntent({
                kind: "triage",
                parameters: {
                  source: triageSource(command) === "all" ? prevParse.intent.parameters.source : triageSource(command),
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
