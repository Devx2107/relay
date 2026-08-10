import { describe, expect, it, vi } from "vitest";
import type { TriageInputs } from "../lib/triage";
import type { RankedTriageCandidate } from "../lib/triage-ranking";
import { TriageItemService } from "../lib/triage-items";

const signals = {
  urgency: 25,
  responseExpectation: 20,
  deadline: 12,
  senderRelevance: 10,
  calendarProximity: 0,
  recency: 5,
  explicitUrgency: 5,
};

function candidate(id: string, score: number, timestamp: string): RankedTriageCandidate {
  return {
    id: `email:${id}`,
    source: "email",
    summary: `Subject ${id}`,
    text: "Safe text",
    timestamp,
    sender: "sender@example.com",
    attendees: ["me@example.com"],
    unread: true,
    important: true,
    responseExpectation: "expected",
    signals,
    score,
    urgency: score >= 60 ? "high" : "medium",
    reason: "Needs a response.",
  };
}

function row(item: RankedTriageCandidate) {
  return {
    id: `row-${item.id}`,
    source: item.source,
    source_id: item.id.replace(`${item.source}:`, ""),
    status: "pending",
    confidence: null,
    content: {
      score: item.score,
      urgency: item.urgency,
      reason: item.reason,
      signals: item.signals,
      summary: item.summary,
      timestamp: item.timestamp,
      sender: item.sender,
      attendees: item.attendees,
      supportedActions: ["reply", "ignore", "snooze"],
    },
    created_at: "2026-08-09T12:00:00.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
  };
}

function createMockClient(rows: unknown[] = []) {
  const upsertSelect = vi.fn().mockResolvedValue({ data: rows, error: null });
  const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
  const select = vi.fn().mockImplementation(() => {
    const readQuery = { eq: vi.fn() };
    readQuery.eq
      .mockImplementationOnce(() => readQuery)
      .mockImplementationOnce(() => Promise.resolve({ data: rows, error: null }));
    return readQuery;
  });
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from: vi.fn().mockReturnValue({ upsert, select }),
  };
  return { client, upsert, select };
}

const sourceInputs: TriageInputs = {
  retrievedAt: "2026-08-09T12:00:00.000Z",
  email: {
    error: { source: "email", code: "rate_limited", message: "Try again later.", retryable: true },
  },
  calendar: { data: { items: [] } },
};

describe("TriageItemService", () => {
  it("upserts safe, user-owned content using the source conflict key", async () => {
    const item = candidate("thread-1", 77, "2026-08-09T11:00:00.000Z");
    const mock = createMockClient([row(item)]);
    const service = new TriageItemService(async () => mock.client as never);

    const result = await service.persist([item]);

    expect(result[0]).toMatchObject({
      id: "row-email:thread-1",
      source: "email",
      sourceId: "thread-1",
    });
    expect(mock.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          user_id: "user-1",
          source: "email",
          source_id: "thread-1",
          content: expect.objectContaining({ score: 77, summary: "Subject thread-1" }),
        }),
      ],
      { onConflict: "user_id,source,source_id" },
    );
  });

  it("is idempotent for repeated source items", async () => {
    const item = candidate("thread-1", 77, "2026-08-09T11:00:00.000Z");
    const mock = createMockClient([row(item)]);
    const service = new TriageItemService(async () => mock.client as never);

    await service.persist([item]);
    await service.persist([item]);

    expect(mock.upsert).toHaveBeenCalledTimes(2);
    expect(mock.upsert.mock.calls[0][0]).toEqual(mock.upsert.mock.calls[1][0]);
  });

  it("orders valid pending items and clamps the response limit", async () => {
    const older = candidate("a", 70, "2026-08-09T09:00:00.000Z");
    const newer = candidate("b", 70, "2026-08-09T10:00:00.000Z");
    const highest = candidate("c", 90, "2026-08-09T08:00:00.000Z");
    const mock = createMockClient([
      row(older),
      { ...row(newer), content: { invalid: true } },
      row(highest),
      row(newer),
    ]);
    const service = new TriageItemService(async () => mock.client as never);

    const result = await service.getResponse(6, sourceInputs);

    expect(result.items.map((item) => item.sourceId)).toEqual(["c", "b", "a"]);
    expect(result.items).toHaveLength(3);
    expect(result.sourceStatus).toEqual({
      email: {
        state: "unavailable",
        error: { code: "rate_limited", message: "Try again later.", retryable: true },
      },
      calendar: { state: "available" },
    });
  });

  it("returns at least two when available and never more than five", async () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      row(candidate(`thread-${index}`, 60 - index, "2026-08-09T10:00:00.000Z")),
    );
    const mock = createMockClient(items);
    const service = new TriageItemService(async () => mock.client as never);

    expect((await service.getResponse(1)).items).toHaveLength(2);
    expect((await service.getResponse(99)).items).toHaveLength(5);
  });

  it("rejects unauthenticated persistence and reads", async () => {
    const mock = createMockClient();
    mock.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const service = new TriageItemService(async () => mock.client as never);
    const item = candidate("thread-1", 77, "2026-08-09T11:00:00.000Z");

    await expect(service.persist([item])).rejects.toThrow(/Authentication is required/);
    await expect(service.getResponse()).rejects.toThrow(/Authentication is required/);
    expect(mock.client.from).not.toHaveBeenCalled();
  });
});
