import { isValidTimeZone } from "./agent/contracts";

const GRID_MINUTES = 30;
const SAMPLE_MINUTES = 15;
const WORKDAY_START_MINUTES = 9 * 60;
const WORKDAY_END_MINUTES = 17 * 60;
const MAX_WINDOW_DAYS = 14;
const MAX_RESULTS = 3;

export interface BusyInterval {
  start: string;
  end: string;
}

export interface AvailabilitySearchRequest {
  attendees: string[];
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  timeZone: string;
  maxResults?: number;
}

export interface AvailableSlot {
  start: string;
  end: string;
  timeZone: string;
  durationMinutes: number;
  rank: number;
  reason: "Available for all attendees.";
}

export interface CalendarAvailabilityPayload {
  calendars: Record<string, { busy: BusyInterval[] }>;
}

export class AvailabilityDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityDataError";
  }
}

function dateValue(value: string, field: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new AvailabilityDataError(`${field} is invalid.`);
  return result;
}

function localParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: get("hour") * 60 + get("minute"),
  };
}

function normalizeIntervals(
  attendees: string[],
  calendars: Record<string, { busy: BusyInterval[] }>,
  windowStart: number,
  windowEnd: number,
): Map<string, Array<{ start: number; end: number }>> {
  const result = new Map<string, Array<{ start: number; end: number }>>();
  for (const attendee of attendees) {
    const calendar = calendars[attendee];
    if (!calendar || !Array.isArray(calendar.busy)) {
      throw new AvailabilityDataError("Availability was incomplete for one or more attendees.");
    }
    const intervals = calendar.busy
      .map((interval) => {
        const start = dateValue(interval.start, "Busy interval start");
        const end = dateValue(interval.end, "Busy interval end");
        if (end <= start) throw new AvailabilityDataError("A busy interval was invalid.");
        return { start: Math.max(start, windowStart), end: Math.min(end, windowEnd) };
      })
      .filter((interval) => interval.start < interval.end)
      .sort((left, right) => left.start - right.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of intervals) {
      const previous = merged[merged.length - 1];
      if (previous && interval.start <= previous.end)
        previous.end = Math.max(previous.end, interval.end);
      else merged.push(interval);
    }
    result.set(attendee, merged);
  }
  return result;
}

function validateRequest(request: AvailabilitySearchRequest): {
  start: number;
  end: number;
  maxResults: number;
} {
  if (!Array.isArray(request.attendees) || request.attendees.length === 0) {
    throw new AvailabilityDataError("At least one attendee is required to check availability.");
  }
  if (!isValidTimeZone(request.timeZone))
    throw new AvailabilityDataError("The scheduling timezone is invalid.");
  if (
    !Number.isInteger(request.durationMinutes) ||
    request.durationMinutes < 5 ||
    request.durationMinutes > 480
  ) {
    throw new AvailabilityDataError("The scheduling duration is invalid.");
  }
  const start = dateValue(request.windowStart, "Availability window start");
  const end = dateValue(request.windowEnd, "Availability window end");
  if (end <= start || end - start > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    throw new AvailabilityDataError("The availability window is invalid.");
  }
  return {
    start,
    end,
    maxResults: Math.min(Math.max(request.maxResults ?? MAX_RESULTS, 1), MAX_RESULTS),
  };
}

export function findAvailableSlots(
  request: AvailabilitySearchRequest,
  payload: CalendarAvailabilityPayload,
): AvailableSlot[] {
  const { start, end, maxResults } = validateRequest(request);
  if (
    !payload ||
    typeof payload !== "object" ||
    !payload.calendars ||
    typeof payload.calendars !== "object"
  ) {
    throw new AvailabilityDataError("Availability data was unavailable.");
  }
  const intervals = normalizeIntervals(request.attendees, payload.calendars, start, end);
  const slots: AvailableSlot[] = [];
  const sampleMs = SAMPLE_MINUTES * 60 * 1000;
  const durationMs = request.durationMinutes * 60 * 1000;
  let candidate = Math.ceil(start / sampleMs) * sampleMs;
  let iterations = 0;

  while (candidate + durationMs <= end && iterations < MAX_WINDOW_DAYS * 24 * 4) {
    const candidateDate = new Date(candidate);
    const finishDate = new Date(candidate + durationMs);
    const localStart = localParts(candidateDate, request.timeZone);
    const localEnd = localParts(finishDate, request.timeZone);
    const isWeekday = localStart.weekday !== "Sat" && localStart.weekday !== "Sun";
    const isGrid = localStart.minutes % GRID_MINUTES === 0;
    const sameLocalDay = localStart.date === localEnd.date;
    const withinWorkday =
      localStart.minutes >= WORKDAY_START_MINUTES &&
      localEnd.minutes <= WORKDAY_END_MINUTES &&
      localEnd.minutes > localStart.minutes;
    const blocked = [...intervals.values()].some((attendeeIntervals) =>
      attendeeIntervals.some(
        (interval) => interval.start < candidate + durationMs && interval.end > candidate,
      ),
    );

    if (isWeekday && isGrid && sameLocalDay && withinWorkday && !blocked) {
      slots.push({
        start: candidateDate.toISOString(),
        end: finishDate.toISOString(),
        timeZone: request.timeZone,
        durationMinutes: request.durationMinutes,
        rank: slots.length + 1,
        reason: "Available for all attendees.",
      });
      if (slots.length >= maxResults) break;
    }
    candidate += sampleMs;
    iterations += 1;
  }
  return slots;
}
