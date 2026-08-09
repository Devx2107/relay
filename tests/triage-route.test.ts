import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBriefing: vi.fn(),
  MockAuthError: class MockAuthError extends Error {},
}));

vi.mock("../lib/triage-briefing", () => ({
  TriageBriefingAuthError: mocks.MockAuthError,
  TriageBriefingService: vi.fn().mockImplementation(() => ({ getBriefing: mocks.getBriefing })),
}));

import { GET } from "../app/api/triage/route";

describe("triage API route", () => {
  it("returns a no-store briefing and forwards the requested limit", async () => {
    mocks.getBriefing.mockResolvedValueOnce({ items: [], generatedAt: "now" });

    const response = await GET(new Request("http://localhost/api/triage?limit=3"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ items: [], generatedAt: "now" });
    expect(mocks.getBriefing).toHaveBeenCalledWith(3);
  });

  it("maps authentication failures without exposing provider details", async () => {
    mocks.getBriefing.mockRejectedValueOnce(new mocks.MockAuthError("internal auth detail"));

    const response = await GET(new Request("http://localhost/api/triage"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "authentication_required",
        message: "Sign in to load your triage briefing.",
        retryable: false,
      },
    });
  });

  it("maps unexpected failures to a safe retryable response", async () => {
    mocks.getBriefing.mockRejectedValueOnce(new Error("provider secret"));

    const response = await GET(new Request("http://localhost/api/triage"));

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("provider secret");
  });
});
