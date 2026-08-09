import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/chat/route";
import { createClient } from "../lib/supabase/server";
import { AgentService } from "../lib/agent/service";

const mockSupabase = { auth: { getUser: vi.fn() }, from: vi.fn() };

vi.mock("../lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("../lib/agent/service", () => ({
  AgentService: vi.fn(),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: undefined } },
    });
  });

  it("rejects a conversation that is not owned by the authenticated user", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "conversation is not visible" },
    });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single,
    } as any;
    mockSupabase.from.mockReturnValue(query);

    const response = await POST(request({ command: "show my inbox", conversationId: "other" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conversation not found" });
    expect(mockSupabase.from).toHaveBeenCalledWith("conversations");
    expect(vi.mocked(AgentService)).not.toHaveBeenCalled();
  });

  it("does not expose conversation database errors", async () => {
    const query = {
      insert: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "secret postgres details", detail: "private schema data" },
      }),
    } as any;
    mockSupabase.from.mockReturnValue(query);

    const response = await POST(request({ command: "show my inbox" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: "internal_error", message: "Internal server error", retryable: true },
    });
    expect(JSON.stringify(body)).not.toContain("secret postgres details");
    expect(JSON.stringify(body)).not.toContain("private schema data");
    expect(body.stack).toBeUndefined();
  });

  it("does not expose stack traces from unexpected failures", async () => {
    const ownedQuery = {
      select: vi.fn(() => ownedQuery),
      eq: vi.fn(() => ownedQuery),
      single: vi.fn().mockResolvedValue({ data: { id: "conversation-1" }, error: null }),
    } as any;
    const messageQuery = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as any;
    mockSupabase.from.mockImplementation((table: string) =>
      table === "conversations" ? ownedQuery : messageQuery,
    );
    vi.mocked(AgentService).mockImplementationOnce(
      () => ({ startRun: vi.fn().mockRejectedValue(new Error("provider internals")) }) as never,
    );

    const response = await POST(
      request({ command: "show my inbox", conversationId: "conversation-1" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: "internal_error", message: "Internal server error", retryable: true },
    });
    expect(body.stack).toBeUndefined();
  });
});
