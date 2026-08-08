import { describe, expect, it, beforeEach } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { GmailService } from "../lib/gmail";

describe("GmailService", () => {
  let mockIntegration: MockIntegrationService;
  let gmail: GmailService;

  beforeEach(() => {
    mockIntegration = new MockIntegrationService();
    gmail = new GmailService(mockIntegration);
  });

  it("searchThreads sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.list", {
      content: "Success",
      data: { threads: [{ id: "t1", snippet: "Test thread" }] }
    });

    const result = await gmail.searchThreads("tenant-123", "is:unread", 5);

    expect(result.content).toBe("Success");
    expect(result.data.threads[0].id).toBe("t1");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-123");
    expect(calls[0].call.plugin).toBe("gmail");
    expect(calls[0].call.action).toBe("api.threads.list");
    expect(calls[0].call.args).toEqual({ q: "is:unread", maxResults: 5 });
  });

  it("getThread sends the correct ToolCall", async () => {
    mockIntegration.mockResponse("gmail", "api.threads.get", {
      content: "Success",
      data: { id: "t2", messages: [] }
    });

    const result = await gmail.getThread("tenant-456", "t2");

    expect(result.data.id).toBe("t2");

    const calls = mockIntegration.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-456");
    expect(calls[0].call.action).toBe("api.threads.get");
    expect(calls[0].call.args).toEqual({ id: "t2", format: "full" });
  });
});
