import { createClient } from "./supabase/server";
import type { TriageInputFailure, TriageInputs, TriageSource } from "./triage";
import type { RankedTriageCandidate, TriageSignalSet, TriageUrgency } from "./triage-ranking";

export type TriageItemStatus = "pending" | "dismissed" | "snoozed";
export type TriageSourceState = "available" | "unavailable";

export interface TriageItemContent {
  score: number;
  urgency: TriageUrgency;
  reason: string;
  signals: TriageSignalSet;
  summary: string;
  timestamp?: string;
  deadlineAt?: string;
  sender?: string;
  attendees: string[];
  supportedActions: string[];
  snoozedUntil?: string;
  snoozePreset?: string;
}

export interface PersistedTriageItem {
  id: string;
  source: TriageSource;
  sourceId: string;
  status: TriageItemStatus;
  confidence?: number;
  content: TriageItemContent;
  createdAt: string;
  updatedAt: string;
}

export type TriageResponseItem = PersistedTriageItem;

export interface TriageSourceStatus {
  state: TriageSourceState;
  error?: Pick<TriageInputFailure, "code" | "message" | "retryable">;
}

export interface TriageResponse {
  items: TriageResponseItem[];
  generatedAt: string;
  sourceStatus?: Record<TriageSource, TriageSourceStatus>;
}

const DEFAULT_RESPONSE_LIMIT = 5;
const MIN_RESPONSE_LIMIT = 2;
const MAX_RESPONSE_LIMIT = 5;
const SUPPORTED_ACTIONS: Record<TriageSource, string[]> = {
  email: ["reply", "ignore", "snooze"],
  calendar: ["ignore", "snooze"],
};

function responseLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_RESPONSE_LIMIT;
  return Math.min(MAX_RESPONSE_LIMIT, Math.max(MIN_RESPONSE_LIMIT, Math.trunc(value as number)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is TriageSource {
  return value === "email" || value === "calendar";
}

function isStatus(value: unknown): value is TriageItemStatus {
  return value === "pending" || value === "dismissed" || value === "snoozed";
}

function isUrgency(value: unknown): value is TriageUrgency {
  return value === "low" || value === "medium" || value === "high";
}

function isSignalSet(value: unknown): value is TriageSignalSet {
  if (!isRecord(value)) return false;
  return [
    "urgency",
    "responseExpectation",
    "deadline",
    "senderRelevance",
    "calendarProximity",
    "recency",
    "explicitUrgency",
  ].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function parseContent(value: unknown): TriageItemContent | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    !isUrgency(value.urgency) ||
    typeof value.reason !== "string" ||
    typeof value.summary !== "string" ||
    !isSignalSet(value.signals) ||
    !Array.isArray(value.attendees) ||
    value.attendees.some((attendee) => typeof attendee !== "string") ||
    !Array.isArray(value.supportedActions) ||
    value.supportedActions.some((action) => typeof action !== "string")
  ) {
    return undefined;
  }
  return {
    score: value.score,
    urgency: value.urgency,
    reason: value.reason,
    signals: value.signals,
    summary: value.summary,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : undefined,
    deadlineAt: typeof value.deadlineAt === "string" ? value.deadlineAt : undefined,
    sender: typeof value.sender === "string" ? value.sender : undefined,
    attendees: value.attendees,
    supportedActions: value.supportedActions,
    snoozedUntil: typeof value.snoozedUntil === "string" ? value.snoozedUntil : undefined,
    snoozePreset: typeof value.snoozePreset === "string" ? value.snoozePreset : undefined,
  };
}

function mapRow(row: unknown): PersistedTriageItem | undefined {
  if (!isRecord(row)) return undefined;
  if (
    typeof row.id !== "string" ||
    !isSource(row.source) ||
    typeof row.source_id !== "string" ||
    !isStatus(row.status) ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return undefined;
  }
  const content = parseContent(row.content);
  if (!content) return undefined;
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    status: row.status,
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeSourceStatus(
  inputs?: TriageInputs,
): Record<TriageSource, TriageSourceStatus> | undefined {
  if (!inputs) return undefined;
  const status = (
    source: TriageSource,
    error: TriageInputFailure | undefined,
  ): TriageSourceStatus =>
    error
      ? {
          state: "unavailable",
          error: { code: error.code, message: error.message, retryable: error.retryable },
        }
      : { state: "available" };
  return {
    email: status("email", inputs.email.error),
    calendar: status("calendar", inputs.calendar.error),
  };
}

function toContent(candidate: RankedTriageCandidate): TriageItemContent {
  return {
    score: candidate.score,
    urgency: candidate.urgency,
    reason: candidate.reason,
    signals: candidate.signals,
    summary: candidate.summary,
    timestamp: candidate.timestamp,
    deadlineAt: candidate.deadlineAt,
    sender: candidate.sender,
    attendees: [...candidate.attendees],
    supportedActions: [...SUPPORTED_ACTIONS[candidate.source]],
  };
}

function compareItems(a: PersistedTriageItem, b: PersistedTriageItem): number {
  if (b.content.score !== a.content.score) return b.content.score - a.content.score;
  const aTime = a.content.timestamp ? new Date(a.content.timestamp).getTime() : 0;
  const bTime = b.content.timestamp ? new Date(b.content.timestamp).getTime() : 0;
  if (bTime !== aTime) return bTime - aTime;
  return `${a.source}:${a.sourceId}`.localeCompare(`${b.source}:${b.sourceId}`);
}

export class TriageItemService {
  constructor(private readonly createServerClient: typeof createClient = createClient) {}

  async persist(candidates: readonly RankedTriageCandidate[]): Promise<PersistedTriageItem[]> {
    const supabase = await this.createServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user)
      throw new Error("Authentication is required to persist triage items.");
    if (candidates.length === 0) return [];

    const rows = candidates.map((candidate) => ({
      user_id: authData.user.id,
      source: candidate.source,
      source_id: candidate.id.replace(`${candidate.source}:`, ""),
      status: "pending" as const,
      confidence: null,
      content: toContent(candidate),
    }));
    const { data, error } = await supabase
      .from("triage_items")
      .upsert(rows, { onConflict: "user_id,source,source_id" })
      .select();
    if (error) throw new Error("Failed to persist triage items.");
    return (data ?? []).map(mapRow).filter((item): item is PersistedTriageItem => Boolean(item));
  }

  async getResponse(limit?: number, inputs?: TriageInputs): Promise<TriageResponse> {
    const supabase = await this.createServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user)
      throw new Error("Authentication is required to read triage items.");

    const pendingResult = await supabase
      .from("triage_items")
      .select("id, source, source_id, status, confidence, content, created_at, updated_at")
      .eq("user_id", authData.user.id)
      .eq("status", "pending");
    const snoozedResult = await supabase
      .from("triage_items")
      .select("id, source, source_id, status, confidence, content, created_at, updated_at")
      .eq("user_id", authData.user.id)
      .eq("status", "snoozed");
    if (pendingResult.error || snoozedResult.error) throw new Error("Failed to read triage items.");

    const parsedItems = Array.from(
      new Map(
        [...(pendingResult.data ?? []), ...(snoozedResult.data ?? [])]
          .map(mapRow)
          .filter((item): item is PersistedTriageItem => Boolean(item))
          .map((item) => [item.id, item] as const),
      ).values(),
    );
    const now = Date.now();
    const expiredSnoozes = parsedItems.filter(
      (item) =>
        item.status === "snoozed" &&
        typeof item.content.snoozedUntil === "string" &&
        new Date(item.content.snoozedUntil).getTime() <= now,
    );
    await Promise.all(
      expiredSnoozes.map(async (item) => {
        await supabase
          .from("triage_items")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("user_id", authData.user.id)
          .eq("status", "snoozed");
        item.status = "pending";
      }),
    );
    const items = parsedItems
      .filter(
        (item) =>
          item.status === "pending" ||
          (item.status === "snoozed" &&
            typeof item.content.snoozedUntil === "string" &&
            new Date(item.content.snoozedUntil).getTime() <= now),
      )
      .sort(compareItems)
      .slice(0, responseLimit(limit));
    return {
      items,
      generatedAt: new Date().toISOString(),
      sourceStatus: safeSourceStatus(inputs),
    };
  }
}
