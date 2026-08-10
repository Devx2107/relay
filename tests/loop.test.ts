import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../lib/agent/loop";
import { GroqAdapter } from "../lib/agent/groq";
import { ToolRegistry } from "../lib/agent/tools";
import type { IntegrationService } from "../lib/integration";

describe("AgentLoop", () => {
  it("answers help locally without Groq or integration calls", async () => {
    const onComplete = vi.fn();
    const groqComplete = vi.fn();
    const integration = { executeTool: vi.fn() } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "help-run",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: groqComplete } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("What are your features?", [
      { role: "user", content: "Schedule a meeting tomorrow" },
    ]);

    expect(groqComplete).not.toHaveBeenCalled();
    expect(integration.executeTool).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: { finalSummary: expect.stringContaining("triage") },
      }),
    );
  });

  it("asks for scheduling requirements instead of reading calendar triage", async () => {
    const onComplete = vi.fn();
    const groqComplete = vi.fn();
    const integration = { executeTool: vi.fn() } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-clarification-run",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: groqComplete } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Schduele a meeting and ask me all the requirements for it");

    expect(groqComplete).not.toHaveBeenCalled();
    expect(integration.executeTool).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: { finalSummary: expect.stringContaining("date and time") },
      }),
    );
  });

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

  it("plans and reads triage without proposing a write action", async () => {
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

      return Promise.resolve({ text: "I found the requested emails.", usedFallback: false });
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
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));

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
        status: "completed",
        metadata: expect.objectContaining({ finalSummary: "I found the requested emails." }),
      }),
    );
    expect(groqComplete).toHaveBeenCalledTimes(2);
    const summaryMessages = groqComplete.mock.calls[1][0];
    expect(summaryMessages).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "tool" })]),
    );
    expect(summaryMessages).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ tool_calls: expect.anything() })]),
    );
  });

  it("uses the standard meeting template for calendar reads", async () => {
    const onComplete = vi.fn();
    const complete = vi.fn().mockResolvedValue({
      toolCalls: [
        {
          id: "calendar-read",
          type: "function",
          function: { name: "calendar.get_upcoming_events", arguments: '{"calendarId":"primary"}' },
        },
      ],
    });
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          items: [
            {
              id: "event-1",
              summary: "Team sync",
              start: { dateTime: "2026-08-11T09:00:00.000Z" },
              end: { dateTime: "2026-08-11T09:30:00.000Z" },
              location: "Meeting room A",
              attendees: [{ email: "person@example.com" }],
              description: "Weekly product update",
            },
          ],
        },
      }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "calendar-template-run",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Show my upcoming meetings");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: expect.objectContaining({
          finalSummary: expect.stringContaining("| Description | Weekly product update |"),
        }),
      }),
    );
  });

  it("requires a meeting selection before proposing calendar cancellation", async () => {
    const onComplete = vi.fn();
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          items: [
            {
              id: "event-1",
              summary: "Team sync",
              start: { dateTime: "2026-08-11T09:00:00.000Z" },
              end: { dateTime: "2026-08-11T09:30:00.000Z" },
              description: "Weekly product update",
            },
          ],
        },
      }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "calendar-cancel-selection-run",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: vi.fn() } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Cancel this meeting");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: expect.objectContaining({
          calendarAction: "cancel",
          calendarEvents: [
            expect.objectContaining({ id: "event-1", description: "Weekly product update" }),
          ],
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
    const groqComplete = vi.fn((_messages, _fallback, tools) => {
      expect(tools?.map((tool: any) => tool.function.name)).toEqual([
        "calendar.check_availability",
      ]);
      const availabilityTool = tools?.[0];
      expect(availabilityTool.function.parameters.additionalProperties).toBe(false);
      expect(availabilityTool.function.parameters.properties.timeMin).toEqual({
        type: "string",
        format: "date-time",
      });
      expect(availabilityTool.function.parameters.properties.items.items.additionalProperties).toBe(
        false,
      );
      return Promise.resolve({
        text: "I have enough context to schedule this.",
        usedFallback: false,
      });
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

  it("checks an explicit same-day window without asking Groq to infer tool arguments", async () => {
    const onComplete = vi.fn();
    const groqComplete = vi.fn();
    const lifecycle: string[] = [];
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          calendars: {
            primary: { busy: [] },
            "rahul@example.com": { busy: [] },
          },
        },
      }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-run-explicit-window",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: groqComplete } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: async (event) => {
        if (event.status === "waiting_for_approval") await Promise.resolve();
        lifecycle.push(`progress:${event.status}`);
      },
      onComplete: async (run) => {
        lifecycle.push(`complete:${run.status}`);
        onComplete(run);
      },
    }).execute("Schedule a meeting with rahul@example.com from 3 to 4 pm for today");

    expect(groqComplete).not.toHaveBeenCalled();
    expect(integration.executeTool).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        plugin: "googlecalendar",
        action: "api.calendar.getAvailability",
        args: expect.objectContaining({
          items: [{ id: "primary" }],
          timeMin: expect.any(String),
          timeMax: expect.any(String),
        }),
      }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waiting_for_approval" }),
    );
    expect(lifecycle.indexOf("progress:waiting_for_approval")).toBeLessThan(
      lifecycle.indexOf("complete:waiting_for_approval"),
    );
  });

  it("checks only the primary calendar when no attendee is mentioned", async () => {
    const onComplete = vi.fn();
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        data: { calendars: { primary: { busy: [] } } },
      }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-run-primary-only",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: vi.fn() } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Schedule a meeting from 3 to 4 pm for today");

    expect(integration.executeTool).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        action: "api.calendar.getAvailability",
        args: expect.objectContaining({ items: [{ id: "primary" }] }),
      }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waiting_for_approval" }),
    );
  });

  it("marks a verified no-slot result without presenting action success", async () => {
    const onComplete = vi.fn();
    const integration = {
      executeTool: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          data: {
            calendars: {
              primary: {
                busy: [{ start: "2026-08-10T09:30:00.000Z", end: "2026-08-10T10:30:00.000Z" }],
              },
              "rahul@example.com": {
                busy: [{ start: "2026-08-10T09:30:00.000Z", end: "2026-08-10T10:30:00.000Z" }],
              },
            },
          },
        },
      }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-run-no-slots",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      groq: { complete: vi.fn() } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Schedule a meeting with rahul@example.com from 3 to 4 pm for today");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        metadata: expect.objectContaining({ outcome: "no_availability" }),
      }),
    );
  });

  it("falls back to primary events when free/busy omits calendars", async () => {
    const onComplete = vi.fn();
    const integration = {
      executeTool: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: { kind: "freeBusy", timeMin: "x", timeMax: "y" } })
        .mockResolvedValueOnce({ ok: true, data: { items: [] } }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-run-primary-fallback",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      accountEmail: "rahul@example.com",
      groq: { complete: vi.fn() } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Schedule a meeting with rahul@example.com from 3 to 4 pm for today");

    expect(integration.executeTool).toHaveBeenCalledTimes(2);
    expect(integration.executeTool).toHaveBeenNthCalledWith(
      2,
      "tenant-1",
      expect.objectContaining({ action: "api.events.getMany", plugin: "googlecalendar" }),
    );
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waiting_for_approval" }),
    );
  });

  it("does not require attendee calendar access before proposing an invitation", async () => {
    const onComplete = vi.fn();
    const integration = {
      executeTool: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: { kind: "freeBusy", timeMin: "x", timeMax: "y" } })
        .mockResolvedValueOnce({ ok: true, data: { items: [] } }),
    } as unknown as IntegrationService;

    await new AgentLoop({
      runId: "schedule-run-unmatched-attendee",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      accountEmail: "different@example.com",
      groq: { complete: vi.fn() } as unknown as GroqAdapter,
      registry: new ToolRegistry(integration),
      onProgress: vi.fn(),
      onComplete,
    }).execute("Schedule a meeting with rahul@example.com from 3 to 4 pm for today");

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "waiting_for_approval" }),
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
