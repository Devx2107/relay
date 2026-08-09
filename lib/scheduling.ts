import {
  isValidTimeZone,
  type ScheduleOptions,
  type ScheduleOptionSource,
} from "./agent/contracts";

export const DEFAULT_SCHEDULE_DURATION_MINUTES = 30;
export const DEFAULT_SCHEDULE_PROVIDER = "google_meet" as const;
export const DEFAULT_SCHEDULE_CALENDAR = "primary" as const;
export const FALLBACK_SCHEDULE_TIME_ZONE = "Asia/Kolkata";
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 480;

export class ScheduleOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleOptionsError";
  }
}

function optionSource(
  value: string | undefined,
  fallback: ScheduleOptionSource,
): ScheduleOptionSource {
  return value ? "user" : fallback;
}

function parseDuration(request: string): number | undefined {
  const matches = [...request.matchAll(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/gi)];
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new ScheduleOptionsError("Provide one meeting duration.");
  const value = Number(matches[0][1]);
  const unit = matches[0][2].toLowerCase();
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ScheduleOptionsError("Meeting duration must be a whole number of minutes or hours.");
  }
  const minutes = unit.startsWith("h") ? value * 60 : value;
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    throw new ScheduleOptionsError(
      `Meeting duration must be between ${MIN_DURATION_MINUTES} minutes and ${MAX_DURATION_MINUTES / 60} hours.`,
    );
  }
  return minutes;
}

function parseProvider(request: string): "google_meet" | undefined {
  if (/\b(zoom|microsoft\s+teams|webex)\b/i.test(request)) {
    throw new ScheduleOptionsError("Only Google Meet is supported for scheduling right now.");
  }
  return /\bgoogle\s+meet\b/i.test(request) ? "google_meet" : undefined;
}

function parseCalendar(request: string): "primary" | undefined {
  if (/\b(?:work|personal|secondary|shared)\s+calendar\b/i.test(request)) {
    throw new ScheduleOptionsError(
      "Only the primary calendar is supported for scheduling right now.",
    );
  }
  return /\bprimary\s+calendar\b/i.test(request) ? "primary" : undefined;
}

function parseTimeZone(request: string): string | undefined {
  const match = request.match(
    /\b(?:timezone|time\s+zone)\s*[:=]?\s*([A-Za-z]+(?:[\/_-][A-Za-z0-9_+-]+)+|UTC)\b/i,
  );
  if (!match) return undefined;
  if (!isValidTimeZone(match[1])) throw new ScheduleOptionsError("That timezone is not supported.");
  return match[1];
}

export function resolveAccountTimeZone(accountTimeZone?: string): {
  timeZone: string;
  source: ScheduleOptionSource;
} {
  if (accountTimeZone !== undefined) {
    if (!isValidTimeZone(accountTimeZone))
      throw new ScheduleOptionsError("The account timezone is invalid.");
    return { timeZone: accountTimeZone, source: "user" };
  }
  return { timeZone: FALLBACK_SCHEDULE_TIME_ZONE, source: "fallback" };
}

export function applyScheduleDefaults(request: string, accountTimeZone?: string): ScheduleOptions {
  const durationMinutes = parseDuration(request);
  const meetingProvider = parseProvider(request);
  const calendarId = parseCalendar(request);
  const requestedTimeZone = parseTimeZone(request);
  const accountZone = resolveAccountTimeZone(accountTimeZone);

  return {
    durationMinutes: durationMinutes ?? DEFAULT_SCHEDULE_DURATION_MINUTES,
    meetingProvider: meetingProvider ?? DEFAULT_SCHEDULE_PROVIDER,
    calendarId: calendarId ?? DEFAULT_SCHEDULE_CALENDAR,
    timeZone: requestedTimeZone ?? accountZone.timeZone,
    sources: {
      durationMinutes: optionSource(durationMinutes?.toString(), "default"),
      meetingProvider: optionSource(meetingProvider, "default"),
      calendarId: optionSource(calendarId, "default"),
      timeZone: optionSource(requestedTimeZone, accountZone.source),
    },
  };
}
