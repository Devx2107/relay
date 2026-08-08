import { describe, expect, it, beforeEach } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { ToolCall } from "../lib/integration";

describe("IntegrationService boundary", () => {
  let mockService: MockIntegrationService;

  beforeEach(() => {
    mockService = new MockIntegrationService();
  });

  it("returns mocked responses for registered calls", async () => {
    mockService.mockResponse("gmail", "api.messages.get", {
      content: "Success",
      data: { id: "msg1", snippet: "Hello world" }
    });

    const call: ToolCall = {
      plugin: "gmail",
      action: "api.messages.get",
      args: { id: "msg1" }
    };

    const result = await mockService.executeTool("tenant-123", call);
    expect(result.content).toBe("Success");
    expect(result.data?.id).toBe("msg1");

    const calls = mockService.getCalls();
    expect(calls.length).toBe(1);
    expect(calls[0].tenantId).toBe("tenant-123");
    expect(calls[0].call.plugin).toBe("gmail");
  });

  it("returns an error for unmocked calls", async () => {
    const call: ToolCall = {
      plugin: "gmail",
      action: "api.messages.unknown",
      args: {}
    };

    const result = await mockService.executeTool("tenant-123", call);
    expect(result.error).toMatch(/No mock provided/);
  });
});
