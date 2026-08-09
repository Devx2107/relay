import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../lib/agent/loop";
import { GroqAdapter } from "../lib/agent/groq";
import { ToolRegistry } from "../lib/agent/tools";
import type { IntegrationService } from "../lib/integration";

describe("AgentLoop", () => {
  it("parses intent and handles invalid commands", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    // We mock GroqAdapter but it won't be called for invalid commands
    const groq = new GroqAdapter({ apiKey: "test-key" });
    const registry = new ToolRegistry({} as IntegrationService);

    const loop = new AgentLoop({
      runId: "run-1",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq,
      registry,
      onProgress,
      onComplete,
    });

    await loop.execute("invalid command", []);

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "received" }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({ code: "invalid_request" }),
      }),
    );
  });

  it("plans, reads, proposes and requests approval", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    let callCount = 0;
    const plannerTools: any[][] = [];
    const groqComplete = vi.fn().mockImplementation((messages, _fallback, tools) => {
      plannerTools.push(tools ?? []);
      callCount++;
      const hasHistory = messages.some((m: any) => m.content === "hello");
      if (!hasHistory) throw new Error("History missing from messages");

      if (callCount === 1) {
        return Promise.resolve({
          toolCalls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "gmail.search_threads", arguments: '{"q":"in:inbox"}' },
            },
          ],
          usedFallback: false,
        });
      }

      return Promise.resolve({
        toolCalls: [
          {
            id: "call-2",
            type: "function",
            function: { name: "gmail.send", arguments: '{"threadId":"123","body":"ok"}' },
          },
        ],
        usedFallback: false,
      });
    });

    const groq = { complete: groqComplete } as unknown as GroqAdapter;

    const integration = {
      executeTool: vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } }),
    } as unknown as IntegrationService;

    const registry = new ToolRegistry(integration);

    const loop = new AgentLoop({
      runId: "run-2",
      tenantId: "tenant-2",
      conversationId: "conv-2",
      groq,
      registry,
      onProgress,
      onComplete,
    });

    await loop.execute("show my unread emails", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "received" }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "planning" }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "reading" }));
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waiting_for_approval" }),
    );

    expect(integration.executeTool).toHaveBeenCalledWith(
      "tenant-2",
      expect.objectContaining({
        action: "api.threads.list",
        plugin: "gmail",
      }),
    );
    const availabilityTool = plannerTools[0].find(
      (tool) => tool.function.name === "calendar.check_availability",
    );
    expect(availabilityTool.function.parameters.properties.items.type).toBe("array");
    expect(availabilityTool.function.parameters.required).toEqual(["timeMin", "timeMax", "items"]);

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "waiting_for_approval",
        metadata: expect.objectContaining({
          proposedAction: "gmail.send",
        }),
      }),
    );
  });

  it("does not execute a write tool returned during planning", async () => {
    const onComplete = vi.fn();
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        toolCalls: [
          {
            id: "write-in-read-phase",
            type: "function",
            function: { name: "gmail.send", arguments: "{}" },
          },
        ],
      })
      .mockResolvedValueOnce({ text: "No action is needed." });
    const integration = { executeTool: vi.fn() } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "run-read-boundary",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("show my unread emails");

    expect(integration.executeTool).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("turns an unexpected planning exception into a retryable failed run", async () => {
    const onComplete = vi.fn();
    const complete = vi.fn().mockRejectedValue(new Error("provider exploded"));

    await new AgentLoop({
      runId: "run-planner-error",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete } as unknown as GroqAdapter,
      registry: new ToolRegistry({} as IntegrationService),
      onProgress: vi.fn(),
      onComplete,
    }).execute("show my unread emails");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({ code: "integration_unavailable", action: "retry" }),
      }),
    );
  });

  it("fails closed when a schedule intent receives no availability check", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const groqComplete = vi.fn().mockResolvedValue({
      text: "I have enough context to schedule this.",
      usedFallback: false,
    });
    const groq = { complete: groqComplete } as unknown as GroqAdapter;
    const integration = {
      executeTool: vi.fn(),
    } as unknown as IntegrationService;
    const registry = new ToolRegistry(integration);

    const loop = new AgentLoop({
      runId: "schedule-run-unverified",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq,
      registry,
      onProgress,
      onComplete,
    });

    await loop.execute("Schedule a meeting with rahul@example.com next week", []);

    expect(groqComplete).toHaveBeenCalledTimes(1);
    expect(integration.executeTool).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: {
          code: "integration_unavailable",
          message: "Verified calendar availability could not be confirmed.",
          retryable: true,
          action: "retry",
        },
      }),
    );
    expect(onComplete).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: "waiting_for_approval",
        metadata: expect.objectContaining({ proposedAction: "calendar.create_event" }),
      }),
    );
  });

  it("verifies executed write action and summarizes", async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    const groqComplete = vi.fn().mockResolvedValueOnce({
      text: "The action was a success.",
      usedFallback: false,
    });

    const groq = { complete: groqComplete } as unknown as GroqAdapter;
    const registry = new ToolRegistry({} as IntegrationService);

    const loop = new AgentLoop({
      runId: "run-3",
      tenantId: "tenant-3",
      conversationId: "conv-3",
      groq,
      registry,
      onProgress,
      onComplete,
    });

    await loop.verify(
      {
        id: "run-3",
        conversationId: "conv-3",
        status: "executing",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { action: "gmail.send", args: { threadId: "123", body: "ok" } },
      { toolCallId: "call-3", ok: true, data: { sent: true } },
    );

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "verifying" }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: expect.objectContaining({
          finalSummary: "The action was a success.",
        }),
      }),
    );
  });
});
