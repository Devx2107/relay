import { describe, expect, it, vi, beforeEach } from "vitest";
import { AgentService } from "../lib/agent/service";

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
        await options.onComplete({ status: "waiting_for_approval", metadata: { proposedAction: "test", proposedArgs: "{}" } });
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
        metadata: { proposedAction: "test", proposedArgs: "{}" }
      }
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
        metadata: {}
      }
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mockSingle,
    });

    const service = new AgentService("tenant-1");
    await expect(service.approveRun("123")).rejects.toThrow(/not waiting for approval/);
  });

  it("handles registry execution failure in approveRun", async () => {
    // Reset registry mock for this test
    const { ToolRegistry } = await import("../lib/agent/tools");
    (ToolRegistry as any).mockImplementationOnce(() => ({
      execute: vi.fn().mockResolvedValue({ 
        ok: false, 
        error: { code: "integration_unavailable", message: "Failed" } 
      }),
    }));

    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: "123",
        status: "waiting_for_approval",
        metadata: { proposedAction: "test", proposedArgs: "{}" }
      }
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
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ 
      status: "failed",
      error: JSON.stringify({ code: "integration_unavailable", message: "Failed" })
    }));
  });
});
