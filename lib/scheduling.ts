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

function parseWindowDuration(request: string): number | undefined {
  const match = request.match(
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (!match) return undefined;
  const startMeridiem = match[3] ?? match[6];
  const start = clockValue(Number(match[1]), Number(match[2] ?? 0), startMeridiem);
  const end = clockValue(Number(match[4]), Number(match[5] ?? 0), match[6]);
  const duration = (end - start) * 60 + Number(match[5] ?? 0) - Number(match[2] ?? 0);
  if (duration <= 0) throw new ScheduleOptionsError("The time window must end after it starts.");
  return duration;
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
  const durationMinutes = parseDuration(request) ?? parseWindowDuration(request);
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

export interface ExplicitScheduleWindow {
  timeMin: string;
  timeMax: string;
}

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Convert a local wall-clock time into an instant without using server timezone. */
function zonedLocalDate(
  date: { year: string; month: string; day: string },
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let instant = Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day), hour, minute);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const displayed = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
    );
    const desired = Date.UTC(
      Number(date.year),
      Number(date.month) - 1,
      Number(date.day),
      hour,
      minute,
    );
    instant += desired - displayed;
  }
  return new Date(instant);
}

function clockValue(hour: number, minute: number, meridiem: string | undefined): number {
  if (minute > 59 || hour < 1 || hour > 12)
    throw new ScheduleOptionsError("The time window is invalid.");
  if (!meridiem) return hour;
  const normalized = meridiem.toLowerCase();
  return (hour % 12) + (normalized === "pm" ? 12 : 0);
}

/** Parse explicit local windows such as “from 7 to 8 pm for today”. */
export function parseExplicitScheduleWindow(
  request: string,
  timeZone: string,
  now: Date = new Date(),
): ExplicitScheduleWindow | undefined {
  const dayMatch = request.match(/\b(today|tomorrow)\b/i);
  if (!dayMatch) return undefined;
  const match = request.match(
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (!match) return undefined;

  const startMeridiem = match[3] ?? match[6];
  const endMeridiem = match[6];
  const startHour = clockValue(Number(match[1]), Number(match[2] ?? 0), startMeridiem);
  const endHour = clockValue(Number(match[4]), Number(match[5] ?? 0), endMeridiem);
  const date = localDateParts(
    new Date(now.getTime() + (dayMatch[1].toLowerCase() === "tomorrow" ? 86400000 : 0)),
    timeZone,
  ) as { year: string; month: string; day: string };
  const start = zonedLocalDate(date, startHour, Number(match[2] ?? 0), timeZone);
  const end = zonedLocalDate(date, endHour, Number(match[5] ?? 0), timeZone);
  if (end <= start) throw new ScheduleOptionsError("The time window must end after it starts.");
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}
