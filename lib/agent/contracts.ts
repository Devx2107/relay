export type JsonPrimitive =
  string | number | boolean | null | { [key: string]: JsonPrimitive } | JsonPrimitive[];
// Metadata is validated at the runtime boundary by safeMetadata(); callers must
// narrow values before using them as structured data.
export type SafeMetadata = Record<string, unknown>;

export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type IntentKind = "triage" | "schedule";
export type ToolOperation = "read" | "write";
export type ScheduleAttendeeStatus = "provided" | "missing" | "unresolved";
export type ScheduleMeetingProvider = "google_meet";
export type ScheduleCalendarId = "primary";
export type ScheduleOptionSource = "user" | "default" | "fallback";

export const MAX_SCHEDULE_ATTENDEES = 20;
export const SCHEDULE_EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export interface TriageIntent {
  kind: "triage";
  parameters: {
    source?: "email" | "calendar" | "all";
    limit?: number;
    calendarAction?: "cancel" | "reschedule";
  };
}

export interface ScheduleIntent {
  kind: "schedule";
  parameters: {
    request: string;
    attendees?: string[];
    attendeeStatus: ScheduleAttendeeStatus;
    unresolvedAttendees?: string[];
    location?: string;
    agenda?: string;
    recurrence?: "one_off" | "recurring";
    recurrenceRule?: string;
    reminderMinutes?: number;
    options: ScheduleOptions;
  };
}

export interface ScheduleOptions {
  durationMinutes: number;
  meetingProvider: ScheduleMeetingProvider;
  calendarId: ScheduleCalendarId;
  timeZone: string;
  sources: {
    durationMinutes: ScheduleOptionSource;
    meetingProvider: ScheduleOptionSource;
    calendarId: ScheduleOptionSource;
    timeZone: ScheduleOptionSource;
  };
}

export type AgentIntent = TriageIntent | ScheduleIntent;

export interface AgentRun {
  id: string;
  conversationId: string;
  status: AgentRunStatus;
  intent?: AgentIntent;
  error?: UserFacingError;
  createdAt: string;
  updatedAt: string;
  metadata?: SafeMetadata;
}

export interface AgentToolCall {
  id: string;
  tenantId: string;
  plugin: string;
  action: string;
  operation: ToolOperation;
  args: Record<string, unknown>;
}

export interface AgentToolResult {
  toolCallId: string;
  ok: boolean;
  content?: string;
  data?: unknown;
  error?: UserFacingError;
  failure?: {
    code: "auth_missing" | "permission_required" | "rate_limited" | "integration_error";
    retryable: boolean;
  };
}

export type AgentProgressStatus =
  | "received"
  | "planning"
  | "reading"
  | "waiting_for_approval"
  | "executing"
  | "verifying"
  | "completed"
  | "failed";

export interface AgentProgressEvent {
  runId: string;
  status: AgentProgressStatus;
  message: string;
  createdAt: string;
}

export type UserFacingErrorCode =
  | "invalid_request"
  | "authentication_required"
  | "permission_required"
  | "rate_limited"
  | "integration_unavailable"
  | "approval_required"
  | "execution_failed";

export interface UserFacingError {
  code: UserFacingErrorCode;
  message: string;
  retryable: boolean;
  action?: "sign_in" | "connect_integration" | "retry" | "review_approval";
  plugin?: string;
}

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ContractValidationError(
      `${field} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value;
}

function safeMetadata(value: unknown, field: string): SafeMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ContractValidationError(`${field} must be an object`);

  const result: SafeMetadata = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|token|password|credential|chain.?of.?thought/i.test(key)) {
      throw new ContractValidationError(`${field} contains a sensitive field`);
    }
    if (
      item !== null &&
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    ) {
      throw new ContractValidationError(`${field}.${key} must be a JSON primitive`);
    }
    result[key] = item;
  }
  return result;
}

export function parseAgentIntent(value: unknown): AgentIntent {
  if (!isRecord(value) || (value.kind !== "triage" && value.kind !== "schedule")) {
    throw new ContractValidationError("intent.kind must be triage or schedule");
  }
  if (!isRecord(value.parameters)) {
    throw new ContractValidationError("intent.parameters must be an object");
  }

  if (value.kind === "triage") {
    const source = value.parameters.source;
    const limit = value.parameters.limit;
    const calendarAction = value.parameters.calendarAction;
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new ContractValidationError(
          "triage.parameters.limit must be an integer from 1 to 100",
        );
      }
      parsedLimit = limit;
    }
    if (source !== undefined && source !== "email" && source !== "calendar" && source !== "all") {
      throw new ContractValidationError("triage.parameters.source is invalid");
    }
    if (
      calendarAction !== undefined &&
      calendarAction !== "cancel" &&
      calendarAction !== "reschedule"
    ) {
      throw new ContractValidationError("triage.parameters.calendarAction is invalid");
    }
    return {
      kind: "triage",
      parameters: {
        source,
        limit: parsedLimit,
        ...(calendarAction !== undefined ? { calendarAction } : {}),
      },
    };
  }

  const request = requiredString(value.parameters.request, "schedule.parameters.request", 2000);
  const attendees = value.parameters.attendees;
  const attendeeStatus = value.parameters.attendeeStatus;
  const unresolvedAttendees = value.parameters.unresolvedAttendees;
  const location = value.parameters.location;
  const agenda = value.parameters.agenda;
  const recurrence = value.parameters.recurrence;
  const recurrenceRule = value.parameters.recurrenceRule;
  const reminderMinutes = value.parameters.reminderMinutes;
  const options = value.parameters.options;
  if (
    attendeeStatus !== "provided" &&
    attendeeStatus !== "missing" &&
    attendeeStatus !== "unresolved"
  ) {
    throw new ContractValidationError("schedule.parameters.attendeeStatus is invalid");
  }
  for (const [field, fieldValue, maxLength] of [
    ["location", location, 200],
    ["agenda", agenda, 2000],
  ] as const) {
    if (
      fieldValue !== undefined &&
      (typeof fieldValue !== "string" ||
        fieldValue.trim().length === 0 ||
        fieldValue.length > maxLength)
    ) {
      throw new ContractValidationError(`schedule.parameters.${field} is invalid`);
    }
  }
  if (recurrence !== undefined && recurrence !== "one_off" && recurrence !== "recurring") {
    throw new ContractValidationError("schedule.parameters.recurrence is invalid");
  }
  if (
    recurrenceRule !== undefined &&
    (typeof recurrenceRule !== "string" ||
      !/^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)(?:;COUNT=\d{1,3})?$/.test(recurrenceRule))
  ) {
    throw new ContractValidationError("schedule.parameters.recurrenceRule is invalid");
  }
  if (
    reminderMinutes !== undefined &&
    (!Number.isInteger(reminderMinutes) ||
      (reminderMinutes as number) < 0 ||
      (reminderMinutes as number) > 40320)
  ) {
    throw new ContractValidationError("schedule.parameters.reminderMinutes is invalid");
  }
  if (
    attendees !== undefined &&
    (!Array.isArray(attendees) ||
      attendees.length === 0 ||
      attendees.length > MAX_SCHEDULE_ATTENDEES ||
      attendees.some(
        (attendee) =>
          typeof attendee !== "string" ||
          attendee.length === 0 ||
          attendee !== attendee.toLowerCase() ||
          !SCHEDULE_EMAIL_PATTERN.test(attendee),
      ) ||
      new Set(attendees).size !== attendees.length)
  ) {
    throw new ContractValidationError(
      "schedule.parameters.attendees must contain unique canonical email addresses",
    );
  }
  if (
    unresolvedAttendees !== undefined &&
    (!Array.isArray(unresolvedAttendees) ||
      unresolvedAttendees.length === 0 ||
      unresolvedAttendees.length > MAX_SCHEDULE_ATTENDEES ||
      unresolvedAttendees.some(
        (attendee) =>
          typeof attendee !== "string" || attendee.trim().length === 0 || attendee.length > 120,
      ))
  ) {
    throw new ContractValidationError("schedule.parameters.unresolvedAttendees is invalid");
  }
  if (
    (attendeeStatus === "provided" && (!attendees || attendees.length === 0)) ||
    (attendeeStatus === "missing" && (attendees || unresolvedAttendees)) ||
    (attendeeStatus === "unresolved" && (!unresolvedAttendees || unresolvedAttendees.length === 0))
  ) {
    throw new ContractValidationError(
      "schedule.parameters.attendeeStatus does not match attendee data",
    );
  }
  if (!isRecord(options))
    throw new ContractValidationError("schedule.parameters.options is required");
  if (
    typeof options.durationMinutes !== "number" ||
    !Number.isInteger(options.durationMinutes) ||
    options.durationMinutes < 5 ||
    options.durationMinutes > 480 ||
    options.meetingProvider !== "google_meet" ||
    options.calendarId !== "primary" ||
    typeof options.timeZone !== "string" ||
    !isValidTimeZone(options.timeZone)
  ) {
    throw new ContractValidationError("schedule.parameters.options is invalid");
  }
  if (!isRecord(options.sources))
    throw new ContractValidationError("schedule.parameters.options.sources is required");
  for (const key of ["durationMinutes", "meetingProvider", "calendarId", "timeZone"]) {
    if (
      options.sources[key] !== "user" &&
      options.sources[key] !== "default" &&
      options.sources[key] !== "fallback"
    ) {
      throw new ContractValidationError("schedule.parameters.options.sources is invalid");
    }
  }
  return {
    kind: "schedule",
    parameters: {
      request,
      attendees: attendees as string[] | undefined,
      attendeeStatus,
      unresolvedAttendees: unresolvedAttendees as string[] | undefined,
      ...(location !== undefined ? { location: location as string } : {}),
      ...(agenda !== undefined ? { agenda: agenda as string } : {}),
      ...(recurrence !== undefined ? { recurrence: recurrence as "one_off" | "recurring" } : {}),
      ...(recurrenceRule !== undefined ? { recurrenceRule: recurrenceRule as string } : {}),
      ...(reminderMinutes !== undefined ? { reminderMinutes: reminderMinutes as number } : {}),
      options: options as unknown as ScheduleOptions,
    },
  };
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function parseAgentToolCall(value: unknown): AgentToolCall {
  if (!isRecord(value)) throw new ContractValidationError("tool call must be an object");
  const operation = value.operation;
  if (operation !== "read" && operation !== "write") {
    throw new ContractValidationError("tool call operation must be read or write");
  }
  if (!isRecord(value.args)) throw new ContractValidationError("tool call args must be an object");
  return {
    id: requiredString(value.id, "tool call id"),
    tenantId: requiredString(value.tenantId, "tool call tenantId"),
    plugin: requiredString(value.plugin, "tool call plugin"),
    action: requiredString(value.action, "tool call action"),
    operation,
    args: value.args,
  };
}

export function parseUserFacingError(value: unknown): UserFacingError {
  if (!isRecord(value)) throw new ContractValidationError("user-facing error must be an object");
  const code = value.code;
  const validCodes: UserFacingErrorCode[] = [
    "invalid_request",
    "authentication_required",
    "permission_required",
    "rate_limited",
    "integration_unavailable",
    "approval_required",
    "execution_failed",
  ];
  if (!validCodes.includes(code as UserFacingErrorCode)) {
    throw new ContractValidationError("user-facing error code is invalid");
  }
  if (typeof value.retryable !== "boolean") {
    throw new ContractValidationError("user-facing error retryable must be boolean");
  }
  const action = value.action;
  if (
    action !== undefined &&
    action !== "sign_in" &&
    action !== "connect_integration" &&
    action !== "retry" &&
    action !== "review_approval"
  ) {
    throw new ContractValidationError("user-facing error action is invalid");
  }
  return {
    code: code as UserFacingErrorCode,
    message: requiredString(value.message, "user-facing error message", 500),
    retryable: value.retryable,
    action: action as UserFacingError["action"],
    plugin: typeof (value as any).plugin === "string" ? (value as any).plugin : undefined,
  };
}

export function parseAgentRun(value: unknown): AgentRun {
  if (!isRecord(value)) throw new ContractValidationError("agent run must be an object");
  const status = value.status;
  const validStatuses: AgentRunStatus[] = [
    "queued",
    "running",
    "waiting_for_approval",
    "executing",
    "completed",
    "failed",
    "cancelled",
  ];
  if (!validStatuses.includes(status as AgentRunStatus)) {
    throw new ContractValidationError("agent run status is invalid");
  }
  return {
    id: requiredString(value.id, "agent run id"),
    conversationId: requiredString(value.conversationId, "agent run conversationId"),
    status: status as AgentRunStatus,
    intent: value.intent === undefined ? undefined : parseAgentIntent(value.intent),
    error: value.error === undefined ? undefined : parseUserFacingError(value.error),
    createdAt: requiredString(value.createdAt, "agent run createdAt"),
    updatedAt: requiredString(value.updatedAt, "agent run updatedAt"),
    metadata: safeMetadata(value.metadata, "agent run metadata"),
  };
}
