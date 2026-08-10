import { describe, expect, it, vi } from "vitest";
import type { TriageInputs } from "../lib/triage";
import { TriageBriefingAuthError, TriageBriefingService } from "../lib/triage-briefing";

const inputs: TriageInputs = {
  retrievedAt: "2026-08-09T12:00:00.000Z",
  email: { data: { threads: [] } },
  calendar: {
    error: {
      source: "calendar",
      code: "rate_limited",
      message: "Try again later.",
      retryable: true,
    },
  },
};

function mockClient(user: { id: string; email?: string } | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { vip_contacts: [] } }),
        }),
      }),
    }),
  };
}

describe("TriageBriefingService", () => {
  it("authenticates, retrieves, ranks, persists, and returns a briefing", async () => {
    const client = mockClient({ id: "user-1", email: "me@example.com" });
    const inputService = { retrieve: vi.fn().mockResolvedValue(inputs) };
    const itemService = {
      persist: vi.fn().mockResolvedValue([]),
      reconcile: vi.fn(),
      getResponse: vi.fn().mockResolvedValue({ items: [], generatedAt: "now" }),
    };
    const classifier = { classify: vi.fn() };
    const service = new TriageBriefingService({
      createServerClient: async () => client as never,
      inputService: inputService as never,
      itemService: itemService as never,
      classifier,
    });

    const result = await service.getBriefing(5);

    expect(result.items).toEqual([]);
    expect(inputService.retrieve).toHaveBeenCalledWith("user-1");
    expect(itemService.persist).toHaveBeenCalledWith([]);
    expect(itemService.reconcile).toHaveBeenCalledWith(inputs, []);
    expect(itemService.getResponse).toHaveBeenCalledWith(5, inputs);
    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it("does not call integrations or persistence when unauthenticated", async () => {
    const client = mockClient(null);
    const inputService = { retrieve: vi.fn() };
    const itemService = { persist: vi.fn(), getResponse: vi.fn() };
    const service = new TriageBriefingService({
      createServerClient: async () => client as never,
      inputService: inputService as never,
      itemService: itemService as never,
    });

    await expect(service.getBriefing()).rejects.toBeInstanceOf(TriageBriefingAuthError);
    expect(inputService.retrieve).not.toHaveBeenCalled();
    expect(itemService.persist).not.toHaveBeenCalled();
  });

  it("preserves safe partial source status through the response service", async () => {
    const client = mockClient({ id: "user-1" });
    const inputService = { retrieve: vi.fn().mockResolvedValue(inputs) };
    const itemService = {
      persist: vi.fn().mockResolvedValue([]),
      getResponse: vi.fn().mockResolvedValue({
        items: [],
        generatedAt: "now",
        sourceStatus: { calendar: { state: "unavailable" } },
      }),
    };
    const service = new TriageBriefingService({
      createServerClient: async () => client as never,
      inputService: inputService as never,
      itemService: itemService as never,
      classifier: { classify: vi.fn() },
    });

    const result = await service.getBriefing();

    expect(result.sourceStatus).toEqual({ calendar: { state: "unavailable" } });
    expect(itemService.getResponse).toHaveBeenCalledWith(undefined, inputs);
  });
});
