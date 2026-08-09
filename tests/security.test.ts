import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as authCallback } from "../app/auth/callback/route";
import { GET as connect } from "../app/api/connect/route";
import { POST as approve } from "../app/api/runs/[id]/approve/route";
import { createClient } from "../lib/supabase/server";
import { AgentService } from "../lib/agent/service";

const mockSupabase = {
  auth: {
    exchangeCodeForSession: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  getDb: vi.fn(() => ({ query: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("../corsair", () => ({
  getCorsair: vi.fn(),
}));

vi.mock("../lib/agent/service", () => ({
  AgentService: vi.fn(),
}));

describe("security boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
  });

  it("does not redirect OAuth callbacks to an external next URL", async () => {
    const response = await authCallback(
      new Request("http://localhost/auth/callback?code=auth-code&next=https%3A%2F%2Fevil.example"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("only creates connect links for supported integrations", async () => {
    const response = await connect(new Request("http://localhost/api/connect?plugin=evil"));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Unsupported integration");
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("does not expose approval exception details", async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn().mockResolvedValue({
        data: { conversations: { user_id: "user-1" } },
        error: null,
      }),
    } as any;
    mockSupabase.from.mockReturnValue(query);
    vi.mocked(AgentService).mockImplementation(
      () =>
        ({ approveRun: vi.fn().mockRejectedValue(new Error("private provider details")) }) as any,
    );

    const response = await approve(
      new Request("http://localhost/api/runs/run-1/approve", { method: "POST" }),
      {
        params: Promise.resolve({ id: "run-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "approval_failed",
        message: "The run could not be approved.",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("private provider details");
  });
});
