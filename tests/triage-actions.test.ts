import { beforeEach, describe, expect, it, vi } from "vitest";
import { TriageActionService } from "../lib/triage-actions";

const state = {
  user: { id: "user-1" },
  triageItem: {
    id: "item-1",
    source: "email",
    source_id: "thread-1",
    status: "pending",
    content: { supportedActions: ["reply", "ignore", "snooze"] },
  },
  conversation: { id: "conversation-1" },
  inserted: undefined as Record<string, unknown> | undefined,
};

function client() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })) },
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: table === "agent_runs" ? [] : [], error: null })),
        insert: vi.fn((value: Record<string, unknown>) => {
          state.inserted = value;
          return query;
        }),
        single: vi.fn(async () => {
          if (table === "triage_items") return { data: state.triageItem, error: null };
          if (table === "conversations") return { data: state.conversation, error: null };
          return {
            data: {
              id: "run-1",
              status: "waiting_for_approval",
              metadata: state.inserted?.metadata,
            },
            error: null,
          };
        }),
      };
      return query;
    }),
  };
}

describe("TriageActionService", () => {
  beforeEach(() => {
    state.inserted = undefined;
    state.triageItem.source = "email";
    state.triageItem.content.supportedActions = ["reply", "ignore", "snooze"];
  });

  it("creates an approval proposal for email archive without provider execution", async () => {
    const supabase = client();
    const service = new TriageActionService(async () => supabase as any);

    const proposal = await service.createProposal({
      conversationId: "conversation-1",
      triageItemId: "item-1",
      action: "ignore",
    });

    expect(proposal).toMatchObject({
      runId: "run-1",
      triageItemId: "item-1",
      action: "ignore",
      status: "waiting_for_approval",
    });
    expect(state.inserted).toMatchObject({
      status: "waiting_for_approval",
      conversation_id: "conversation-1",
    });
    expect((state.inserted?.metadata as any).proposedAction).toBe("gmail.archive_thread");
    expect(JSON.parse((state.inserted?.metadata as any).proposedArgs)).toEqual({
      id: "thread-1",
      removeLabelIds: ["INBOX"],
    });
  });

  it("rejects unsupported reply and arbitrary snooze values", async () => {
    const supabase = client();
    const service = new TriageActionService(async () => supabase as any);

    await expect(
      service.createProposal({
        conversationId: "conversation-1",
        triageItemId: "item-1",
        action: "reply",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    await expect(
      service.createProposal({
        conversationId: "conversation-1",
        triageItemId: "item-1",
        action: "snooze",
        snoozePreset: "invalid" as never,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("uses local dismissal for calendar ignore", async () => {
    state.triageItem.source = "calendar";
    state.triageItem.content.supportedActions = ["ignore", "snooze"];
    const supabase = client();
    const service = new TriageActionService(async () => supabase as any);

    await service.createProposal({
      conversationId: "conversation-1",
      triageItemId: "item-1",
      action: "ignore",
    });

    expect((state.inserted?.metadata as any).proposedAction).toBe("triage.dismiss");
    expect(JSON.parse((state.inserted?.metadata as any).proposedArgs)).toEqual({
      triageItemId: "item-1",
    });
  });

  it("requires authentication before reading an item", async () => {
    const supabase = client();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("expired"),
    } as any);
    const service = new TriageActionService(async () => supabase as any);

    await expect(
      service.createProposal({
        conversationId: "conversation-1",
        triageItemId: "item-1",
        action: "ignore",
      }),
    ).rejects.toMatchObject({ code: "authentication_required" });
  });
});
