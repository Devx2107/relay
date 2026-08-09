import { describe, expect, it, beforeEach, vi } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { ToolCall, CorsairIntegrationService } from "../lib/integration";

import { AuthMissingError, PermissionRequiredError, CorsairClientError } from "corsair";

const { mockpluginAction } = vi.hoisted(() => ({
  mockpluginAction: vi.fn(),
}));

vi.mock("../corsair", () => ({
  getCorsair: vi.fn().mockReturnValue({
    mockplugin: {
      action: mockpluginAction,
    },
  }),
}));

describe("IntegrationService boundary", () => {
  let mockService: MockIntegrationService;

  beforeEach(() => {
    mockService = new MockIntegrationService();
  });

  it("returns mocked responses for registered calls", async () => {
    mockService.mockResponse("gmail", "api.messages.get", {
      content: "Success",
      data: { id: "msg1", snippet: "Hello world" },
    });

    const call: ToolCall = {
      plugin: "gmail",
      action: "api.messages.get",
      args: { id: "msg1" },
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
      args: {},
    };

    const result = await mockService.executeTool("tenant-123", call);
    expect(result.error).toMatch(/No mock provided/);
  });
});

describe("CorsairIntegrationService error mapping", () => {
  it("maps AuthMissingError to isAuthMissing", async () => {
    const service = new CorsairIntegrationService();

    mockpluginAction.mockRejectedValueOnce(
      new AuthMissingError("mockplugin", "oauth_2", "Missing connection"),
    );

    const result = await service.executeTool("tenant-1", {
      plugin: "mockplugin",
      action: "action",
      args: {},
    });

    expect(result.error).toContain("Missing connection");
    expect(result.isAuthMissing).toBe(true);
    expect(result.isPermissionRequired).toBeUndefined();
    expect(result.isRateLimited).toBeUndefined();
  });

  it("maps PermissionRequiredError to isPermissionRequired", async () => {
    const service = new CorsairIntegrationService();

    mockpluginAction.mockRejectedValueOnce(new PermissionRequiredError("Permission denied"));

    const result = await service.executeTool("tenant-1", {
      plugin: "mockplugin",
      action: "action",
      args: {},
    });

    expect(result.error).toContain("Permission denied");
    expect(result.isPermissionRequired).toBe(true);
  });

  it("maps CorsairClientError 401 to isAuthMissing", async () => {
    const service = new CorsairIntegrationService();

    mockpluginAction.mockRejectedValueOnce(
      new CorsairClientError(401, "unauthorized", "Token expired"),
    );

    const result = await service.executeTool("tenant-1", {
      plugin: "mockplugin",
      action: "action",
      args: {},
    });

    expect(result.error).toContain("Token expired");
    expect(result.isAuthMissing).toBe(true);
  });

  it("maps CorsairClientError 429 to isRateLimited", async () => {
    const service = new CorsairIntegrationService();

    mockpluginAction.mockRejectedValueOnce(
      new CorsairClientError(429, "rate_limited", "Too many requests"),
    );

    const result = await service.executeTool("tenant-1", {
      plugin: "mockplugin",
      action: "action",
      args: {},
    });

    expect(result.error).toContain("Too many requests");
    expect(result.isRateLimited).toBe(true);
  });
});
