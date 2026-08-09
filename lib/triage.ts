import { CalendarService } from "./calendar";
import { GmailService } from "./gmail";
import type { ToolResult } from "./integration";

export const DEFAULT_TRIAGE_LIMIT = 10;

export type TriageSource = "email" | "calendar";

export type TriageInputFailureCode =
  "authentication_required" | "permission_required" | "rate_limited" | "integration_unavailable";

export interface TriageInputFailure {
  source: TriageSource;
  code: TriageInputFailureCode;
  message: string;
  retryable: boolean;
}

export interface TriageSourceResult<T> {
  data?: T;
  error?: TriageInputFailure;
}

export interface TriageInputs {
  retrievedAt: string;
  email: TriageSourceResult<unknown>;
  calendar: TriageSourceResult<unknown>;
}

export interface TriageInputOptions {
  emailLimit?: number;
  calendarLimit?: number;
  timeMin?: string;
  now?: () => Date;
}

function failureFromResult(source: TriageSource, result: ToolResult): TriageInputFailure {
  if (result.isAuthMissing) {
    return {
      source,
      code: "authentication_required",
      message: `Reconnect ${source === "email" ? "Gmail" : "Google Calendar"} to continue.`,
      retryable: false,
    };
  }

  if (result.isPermissionRequired) {
    return {
      source,
      code: "permission_required",
      message: `${source === "email" ? "Gmail" : "Google Calendar"} needs additional permission.`,
      retryable: false,
    };
  }

  if (result.isRateLimited) {
    return {
      source,
      code: "rate_limited",
      message: `${source === "email" ? "Gmail" : "Google Calendar"} is temporarily rate-limited.`,
      retryable: true,
    };
  }

  return {
    source,
    code: "integration_unavailable",
    message: `${source === "email" ? "Gmail" : "Google Calendar"} could not be reached.`,
    retryable: true,
  };
}

function sourceResult<T>(source: TriageSource, result: ToolResult): TriageSourceResult<T> {
  if (result.error) {
    return { error: failureFromResult(source, result) };
  }

  return { data: result.data as T };
}

function rejectedResult<T>(source: TriageSource): TriageSourceResult<T> {
  return {
    error: {
      source,
      code: "integration_unavailable",
      message: `${source === "email" ? "Gmail" : "Google Calendar"} could not be reached.`,
      retryable: true,
    },
  };
}

export class TriageInputService {
  constructor(
    private readonly gmail: GmailService,
    private readonly calendar: CalendarService,
  ) {}

  async retrieve(tenantId: string, options: TriageInputOptions = {}): Promise<TriageInputs> {
    const emailLimit = options.emailLimit ?? DEFAULT_TRIAGE_LIMIT;
    const calendarLimit = options.calendarLimit ?? DEFAULT_TRIAGE_LIMIT;
    const timeMin = options.timeMin ?? (options.now ?? (() => new Date()))().toISOString();

    const [emailResult, calendarResult] = await Promise.allSettled([
      this.gmail.searchThreads(tenantId, "in:inbox", emailLimit),
      this.calendar.getUpcomingEvents(tenantId, timeMin, calendarLimit),
    ]);

    return {
      retrievedAt: new Date().toISOString(),
      email:
        emailResult.status === "fulfilled"
          ? sourceResult("email", emailResult.value)
          : rejectedResult("email"),
      calendar:
        calendarResult.status === "fulfilled"
          ? sourceResult("calendar", calendarResult.value)
          : rejectedResult("calendar"),
    };
  }
}
