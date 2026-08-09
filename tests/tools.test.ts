import { describe, expect, it, vi } from "vitest";
import { MockIntegrationService } from "../lib/integration-mock";
import { ToolRegistry, ToolRegistryError, type ToolDefinition } from "../lib/agent/tools";

describe("ToolRegistry", () => {
  it("exposes the verified current read mappings", () => {
    const registry = new ToolRegistry(new MockIntegrationService());

    expect(registry.getDefinition("gmail.search_threads")).toMatchObject({
      plugin: "gmail",
      action: "api.threads.list",
      operation: "read",
      availability: "available",
    });
    expect(registry.getDefinition("gmail.get_thread")).toMatchObject({
      plugin: "gmail",
      action: "api.threads.get",
    });
    expect(registry.getDefinition("calendar.get_upcoming_events")).toMatchObject({
      plugin: "googlecalendar",
      action: "api.events.getMany",
    });
    expect(registry.getDefinition("calendar.check_availability")).toMatchObject({
      plugin: "googlecalendar",
      action: "api.calendar.getAvailability",
    });
  });

  it("rejects unknown tools and caller operation mismatches", async () => {
    const registry = new ToolRegistry(new MockIntegrationService());

    expect(() => registry.getDefinition("gmail.unknown")).toThrow(ToolRegistryError);
    await expect(
      registry.execute({
        id: "call-1",
        tenantId: "tenant-1",
        toolId: "gmail.search_threads",
        operation: "write",
        args: {},
      }),
    ).rejects.toThrow(/registered as read/);
  });

  it("executes reads through the injected integration service with tenant scope", async () => {
    const integration = new MockIntegrationService();
    integration.mockResponse("gmail", "api.threads.list", {
      content: "Success",
      data: { threads: [{ id: "thread-1" }] },
    });
    const registry = new ToolRegistry(integration);

    const result = await registry.execute({
      id: "call-1",
      tenantId: "tenant-1",
      toolId: "gmail.search_threads",
      operation: "read",
      args: { q: "is:unread", maxResults: 5 },
    });

    expect(result).toMatchObject({
      toolCallId: "call-1",
      ok: true,
      data: { threads: [{ id: "thread-1" }] },
    });
    expect(integration.getCalls()).toEqual([
      {
        tenantId: "tenant-1",
        call: {
          plugin: "gmail",
          action: "api.threads.list",
          args: { q: "is:unread", maxResults: 5 },
        },
      },
    ]);
  });

  it("blocks available writes before the approval layer", async () => {
    const integration = new MockIntegrationService();
    const writeDefinition: ToolDefinition = {
      id: "test.available_write",
      plugin: "gmail",
      action: "verified.write.action",
      operation: "write",
      availability: "available",
      description: "Test write",
      argumentNames: ["body"],
    };
    const registry = new ToolRegistry(integration, [writeDefinition]);

    const result = await registry.execute({
      id: "call-write",
      tenantId: "tenant-1",
      toolId: "test.available_write",
      operation: "write",
      args: { body: "Draft" },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "approval_required" } });
    expect(integration.getCalls()).toHaveLength(0);
  });

  it("keeps planned tools unavailable and does not invent an action path", async () => {
    const integration = new MockIntegrationService();
    const execute = vi.spyOn(integration, "executeTool");
    const plannedDefinition: ToolDefinition = {
      id: "test.planned_write",
      plugin: "test",
      operation: "write",
      availability: "planned",
      description: "Planned test",
      argumentNames: [],
    };
    const registry = new ToolRegistry(integration, [plannedDefinition]);

    const result = await registry.execute({
      id: "call-planned",
      tenantId: "tenant-1",
      toolId: "test.planned_write",
      operation: "write",
      args: {},
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "integration_unavailable" },
      failure: { code: "integration_error" },
    });
    expect(registry.getDefinition("test.planned_write").action).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps integration failures into safe agent results", async () => {
    const integration = new MockIntegrationService();
    integration.mockResponse("gmail", "api.threads.get", {
      content: "",
      error: "provider details must not escape",
      isAuthMissing: true,
    });
    const registry = new ToolRegistry(integration);

    const result = await registry.execute({
      id: "call-auth",
      tenantId: "tenant-1",
      toolId: "gmail.get_thread",
      operation: "read",
      args: { id: "thread-1", format: "full" },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "authentication_required" },
      failure: { code: "auth_missing" },
    });
    expect(JSON.stringify(result)).not.toContain("provider details");
  });

  it("executes the approved Gmail archive mapping without leaking provider details", async () => {
    const integration = new MockIntegrationService();
    integration.mockResponse("gmail", "api.threads.modify", {
      content: "Success",
      data: { id: "thread-1" },
    });
    const registry = new ToolRegistry(integration);

    const result = await registry.execute(
      {
        id: "archive-1",
        tenantId: "tenant-1",
        toolId: "gmail.archive_thread",
        operation: "write",
        args: { id: "thread-1", removeLabelIds: ["INBOX"] },
      },
      true,
    );

    expect(result).toMatchObject({ ok: true, data: { id: "thread-1" } });
    expect(integration.getCalls()[0].call).toMatchObject({
      plugin: "gmail",
      action: "api.threads.modify",
      args: { id: "thread-1", removeLabelIds: ["INBOX"] },
    });
  });

  it("runs local triage tools only through an injected server executor", async () => {
    const integration = new MockIntegrationService();
    const execute = vi.fn(async () => ({ content: "local success" }));
    const registry = new ToolRegistry(integration, undefined, execute);

    const result = await registry.execute(
      {
        id: "dismiss-1",
        tenantId: "tenant-1",
        toolId: "triage.dismiss",
        operation: "write",
        args: { triageItemId: "item-1" },
      },
      true,
    );

    expect(result).toMatchObject({ ok: true, content: "local success" });
    expect(execute).toHaveBeenCalledWith("tenant-1", "triage.dismiss", { triageItemId: "item-1" });
    expect(integration.getCalls()).toHaveLength(0);
  });
});
