import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentService, createRunPersistenceQueue } from "../lib/agent/service";

// We need to mock createClient from supabase
const mockSupabase = {
  from: vi.fn(),
};

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Mock AgentLoop
vi.mock("../lib/agent/loop", () => {
  return {
    AgentLoop: vi.fn().mockImplementation((options) => ({
      execute: vi.fn(async () => {
        // Simulate a complete run
        await options.onProgress({ status: "running" });
        await options.onComplete({
          status: "waiting_for_approval",
          metadata: { proposedAction: "test", proposedArgs: "{}" },
        });
      }),
      verify: vi.fn(),
    })),
  };
});

// Mock Registry
vi.mock("../lib/agent/tools", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    ToolRegistry: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockResolvedValue({ ok: true }),
    })),
  };
});

describe("AgentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockSingle = vi.fn().mockResolvedValue({ data: { id: "123", status: "queued" } });
    const mockLimit = vi.fn().mockResolvedValue({ data: [] });

    const queryBuilder: any = {
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: mockSingle,
      limit: mockLimit,
    };

    mockSupabase.from.mockReturnValue(queryBuilder);
  });

  it("serializes progress persistence before final run metadata", async () => {
    const queue = createRunPersistenceQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      order.push("progress-start");
      await firstFinished;
      order.push("progress-finished");
    });
    const final = queue.enqueue(async () => {
      order.push("final-metadata");
    });

    await Promise.resolve();
    expect(order).toEqual(["progress-start"]);
    releaseFirst();
    await Promise.all([first, final]);

    expect(order).toEqual(["progress-start", "progress-finished", "final-metadata"]);
  });

  it("starts a run and interacts with supabase and loop", async () => {
    const service = new AgentService("tenant-1");
    const run = await service.startRun("conv-1", "test");

    expect(mockSupabase.from).toHaveBeenCalledWith("agent_runs");
    expect(mockSupabase.from).toHaveBeenCalledWith("messages");
    expect(run).toBeDefined();
    expect(run.id).toBe("123");
  });

  it("approves a run and sets approved flag in registry execute", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "123",
        status: "waiting_for_approval",
        metadata: { proposedAction: "test", proposedArgs: "{}" },
      },
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
      update: vi.fn().mockReturnThis(),
    });

    const service = new AgentService("tenant-1");
    await service.approveRun("123");

    expect(mockSupabase.from).toHaveBeenCalledWith("agent_runs");
  });

  it("rejects approval if run is not waiting_for_approval", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "123",
        status: "completed",
        metadata: {},
      },
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const service = new AgentService("tenant-1");
    await expect(service.approveRun("123")).rejects.toThrow(/not waiting for approval/);
  });

  it("does not execute a non-scheduling action when another approval claims the run first", async () => {
    const { ToolRegistry } = await import("../lib/agent/tools");
    const execute = vi.fn();
    (ToolRegistry as any).mockImplementationOnce(() => ({ execute }));

    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "claimed-triage-run",
          status: "waiting_for_approval",
          metadata: { proposedAction: "test", proposedArgs: "{}" },
        },
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const queryBuilder: any = {};
    const mockUpdate = vi.fn(() => queryBuilder);
    queryBuilder.select = vi.fn(() => queryBuilder);
    queryBuilder.eq = vi.fn(() => queryBuilder);
    queryBuilder.single = mockSingle;
    queryBuilder.update = mockUpdate;
    mockSupabase.from.mockReturnValue(queryBuilder);

    await expect(new AgentService("tenant-1").approveRun("claimed-triage-run")).rejects.toThrow(
      /no longer waiting/,
    );
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "executing" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("handles registry execution failure in approveRun", async () => {
    // Reset registry mock for this test
    const { ToolRegistry } = await import("../lib/agent/tools");
    (ToolRegistry as any).mockImplementationOnce(() => ({
      execute: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "integration_unavailable", message: "Failed" },
      }),
    }));

    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "123",
        status: "waiting_for_approval",
        metadata: { proposedAction: "test", proposedArgs: "{}" },
      },
    });
    const mockUpdate = vi.fn().mockReturnThis();

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
      update: mockUpdate,
    });

    const service = new AgentService("tenant-1");
    await service.approveRun("123");

    // Check that it sets status to executing first, then failed
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "executing" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: JSON.stringify({ code: "integration_unavailable", message: "Failed" }),
      }),
    );
  });

  it("executes a scheduling proposal once and verifies the event and email", async () => {
    const { ToolRegistry } = await import("../lib/agent/tools");
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: { id: "event-1", htmlLink: "https://calendar.example/event-1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: "event-1",
          htmlLink: "https://calendar.example/verified-event-1",
          organizer: { email: "owner@example.com" },
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { id: "message-1" } });
    (ToolRegistry as any).mockImplementationOnce(() => ({ execute }));

    const run = {
      id: "schedule-run",
      conversation_id: "conv-1",
      status: "waiting_for_approval",
      metadata: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        scheduleProposal: {
          kind: "schedule_proposal",
          version: 1,
          event: {
            summary: "Project kickoff",
            start: "2026-08-10T04:00:00.000Z",
            end: "2026-08-10T04:30:00.000Z",
            timeZone: "Asia/Kolkata",
            durationMinutes: 30,
            meetingProvider: "google_meet",
            calendarId: "primary",
          },
          invitation: { attendees: ["alice@example.com"] },
          alternatives: [],
          email: {
            to: ["alice@example.com"],
            subject: "Project kickoff",
            body: "Please join.",
          },
        },
      },
    };
    const finalRun = {
      ...run,
      status: "completed",
      metadata: {
        ...run.metadata,
        scheduleExecution: { eventId: "event-1", emailMessageId: "message-1" },
      },
    };
    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: run })
      .mockResolvedValueOnce({ data: run })
      .mockResolvedValueOnce({ data: finalRun });
    const queryBuilder: any = {
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    };
    mockSupabase.from.mockReturnValue(queryBuilder);

    const result = await new AgentService("tenant-1").approveRun("schedule-run");

    expect(result.status).toBe("completed");
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ toolId: "calendar.create_event", operation: "write" }),
      true,
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ toolId: "calendar.get_event", operation: "read" }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ toolId: "gmail.send", operation: "write" }),
      true,
    );
  });

  it("rejects an expired scheduling approval before claiming or executing it", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "expired-run",
        status: "waiting_for_approval",
        metadata: {
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          scheduleProposal: {},
        },
      },
    });
    const mockUpdate = vi.fn().mockReturnThis();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: mockUpdate,
      single: mockSingle,
    });

    await expect(new AgentService("tenant-1").approveRun("expired-run")).rejects.toThrow(/expired/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a malformed scheduling proposal before claiming it", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "malformed-run",
        status: "waiting_for_approval",
        metadata: {
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          scheduleProposal: { kind: "schedule_proposal", version: 1 },
        },
      },
    });
    const mockUpdate = vi.fn().mockReturnThis();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: mockUpdate,
      single: mockSingle,
    });

    await expect(new AgentService("tenant-1").approveRun("malformed-run")).rejects.toThrow(
      /invalid/,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does not execute when another approval claims the run first", async () => {
    const { ToolRegistry } = await import("../lib/agent/tools");
    const execute = vi.fn();
    (ToolRegistry as any).mockImplementationOnce(() => ({ execute }));
    const mockSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          id: "claimed-run",
          status: "waiting_for_approval",
          metadata: {
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            scheduleProposal: {
              kind: "schedule_proposal",
              version: 1,
              event: {
                summary: "Project kickoff",
                start: "2026-08-10T04:00:00.000Z",
                end: "2026-08-10T04:30:00.000Z",
                timeZone: "Asia/Kolkata",
                durationMinutes: 30,
                meetingProvider: "google_meet",
                calendarId: "primary",
              },
              invitation: { attendees: ["alice@example.com"] },
              alternatives: [],
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: null, error: new Error("already claimed") });
    const mockUpdate = vi.fn().mockReturnThis();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: mockUpdate,
      single: mockSingle,
    });

    await expect(new AgentService("tenant-1").approveRun("claimed-run")).rejects.toThrow(
      /no longer waiting/,
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
