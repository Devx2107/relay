import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../lib/agent/loop";
import { AgentService } from "../lib/agent/service";
import { ToolRegistry } from "../lib/agent/tools";
import { TriageActionService } from "../lib/triage-actions";
import { createClient } from "../lib/supabase/server";
import type { GroqAdapter } from "../lib/agent/groq";
import type { IntegrationService } from "../lib/integration";

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("../lib/agent/groq", () => ({
  GroqAdapter: vi.fn().mockImplementation(() => ({
    complete: vi.fn().mockResolvedValue({ text: "The approved action completed." }),
  })),
}));

const user = { id: "user-1" };

function approvalClient(run: Record<string, unknown>) {
  const finalRun = {
    ...run,
    status: "completed",
    error: null,
    updated_at: new Date().toISOString(),
  };
  const query: any = {
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi
      .fn()
      .mockResolvedValueOnce({ data: run, error: null })
      .mockResolvedValueOnce({ data: { ...run, status: "executing" }, error: null })
      .mockResolvedValueOnce({ data: finalRun, error: null }),
  };
  return { from: vi.fn(() => query) };
}

function triageProposalClient() {
  const state: { inserted?: Record<string, any> } = {};
  const item = {
    id: "item-1",
    source: "email",
    source_id: "thread-1",
    status: "pending",
    content: { supportedActions: ["reply"] },
  };
  const conversation = { id: "conversation-1" };
  const client: any = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        insert: vi.fn((value: Record<string, unknown>) => {
          state.inserted = value;
          return query;
        }),
        single: vi.fn(async () => {
          if (table === "triage_items") return { data: item, error: null };
          if (table === "conversations") return { data: conversation, error: null };
          return {
            data: {
              id: "triage-run-1",
              status: "waiting_for_approval",
              metadata: state.inserted?.metadata,
            },
            error: null,
          };
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null })),
      };
      return query;
    }),
  };
  return { client, state };
}

describe("end-to-end happy paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a triage reply proposal and executes it after approval", async () => {
    const { client, state } = triageProposalClient();
    const proposal = await new TriageActionService(async () => client).createProposal({
      conversationId: "conversation-1",
      triageItemId: "item-1",
      action: "reply",
      body: "Thanks for reaching out.",
    });
    const metadata = state.inserted?.metadata as Record<string, unknown>;
    const run = {
      id: proposal.runId,
      conversation_id: "conversation-1",
      status: "waiting_for_approval",
      metadata,
    };
    const db = approvalClient(run);
    vi.mocked(createClient).mockResolvedValue(db as never);
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { id: "message-1" } });

    const result = await new AgentService(user.id, {
      registryFactory: () => ({ execute }) as any,
    }).approveRun(proposal.runId);

    expect(proposal.status).toBe("waiting_for_approval");
    expect(result.status).toBe("completed");
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: "gmail.send",
        operation: "write",
        args: { threadId: "thread-1", body: "Thanks for reaching out." },
      }),
      true,
    );
  });

  it("builds a verified scheduling proposal and executes it after approval", async () => {
    const planningGroq = {
      complete: vi.fn().mockResolvedValue({
        toolCalls: [
          {
            id: "availability-1",
            type: "function",
            function: {
              name: "calendar.check_availability",
              arguments: JSON.stringify({
                timeMin: "2026-08-10T00:00:00.000Z",
                timeMax: "2026-08-11T23:59:59.000Z",
                items: [{ id: "alice@example.com" }],
              }),
            },
          },
        ],
      }),
    } as unknown as GroqAdapter;
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        content: "Availability read",
        data: { calendars: { "alice@example.com": { busy: [] } } },
      }),
    } as unknown as IntegrationService;
    const planningComplete = vi.fn();
    await new AgentLoop({
      runId: "schedule-run-1",
      tenantId: user.id,
      conversationId: "conversation-1",
      groq: planningGroq,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete: planningComplete,
    }).execute("Schedule a meeting called Project kickoff with alice@example.com next week");

    const proposedRun = planningComplete.mock.calls[0][0];
    expect(proposedRun.status).toBe("waiting_for_approval");
    expect(proposedRun.metadata.scheduleProposal.kind).toBe("schedule_proposal");

    const db = approvalClient({
      id: "schedule-run-1",
      conversation_id: "conversation-1",
      status: "waiting_for_approval",
      metadata: proposedRun.metadata,
    });
    vi.mocked(createClient).mockResolvedValue(db as never);
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: "event-1", htmlLink: "https://calendar.example/event-1" },
    });

    const result = await new AgentService(user.id, {
      registryFactory: () => ({ execute }) as any,
    }).approveRun("schedule-run-1");

    expect(result.status).toBe("completed");
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: "calendar.create_event", operation: "write" }),
      true,
    );
  });
});
