import type { AgentToolResult, ToolOperation, UserFacingError } from "./contracts";
import type { IntegrationService, ToolCall, ToolResult } from "../integration";

export type ToolAvailability = "available" | "planned";

export interface ToolDefinition {
  id: string;
  plugin: string;
  action?: string;
  operation: ToolOperation;
  availability: ToolAvailability;
  description: string;
  argumentNames: readonly string[];
}

export interface RegistryToolCall {
  id: string;
  tenantId: string;
  toolId: string;
  operation: ToolOperation;
  args: Record<string, unknown>;
}

export class ToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

export const TOOL_DEFINITIONS = [
  {
    id: "gmail.search_threads",
    plugin: "gmail",
    action: "api.threads.list",
    operation: "read",
    availability: "available",
    description: "Search Gmail threads.",
    argumentNames: ["q", "maxResults"],
  },
  {
    id: "gmail.get_thread",
    plugin: "gmail",
    action: "api.threads.get",
    operation: "read",
    availability: "available",
    description: "Read a complete Gmail thread.",
    argumentNames: ["id", "format"],
  },
  {
    id: "calendar.get_upcoming_events",
    plugin: "googlecalendar",
    action: "api.events.getMany",
    operation: "read",
    availability: "available",
    description: "Read upcoming calendar events.",
    argumentNames: ["timeMin", "maxResults", "singleEvents", "orderBy"],
  },
  {
    id: "calendar.check_availability",
    plugin: "googlecalendar",
    action: "api.calendar.getAvailability",
    operation: "read",
    availability: "available",
    description: "Check calendar availability.",
    argumentNames: ["timeMin", "timeMax", "items"],
  },
  {
    id: "gmail.reply_draft",
    plugin: "gmail",
    action: "api.drafts.create",
    operation: "write",
    availability: "available",
    description: "Create an email reply draft.",
    argumentNames: ["threadId", "body"],
  },
  {
    id: "gmail.send",
    plugin: "gmail",
    action: "api.messages.send",
    operation: "write",
    availability: "available",
    description: "Send an email.",
    argumentNames: ["threadId", "body"],
  },
  {
    id: "calendar.create_event",
    plugin: "googlecalendar",
    action: "api.events.create",
    operation: "write",
    availability: "available",
    description: "Create a calendar event.",
    argumentNames: ["summary", "start", "end", "attendees"],
  },
  {
    id: "calendar.modify_event",
    plugin: "googlecalendar",
    action: "api.events.update",
    operation: "write",
    availability: "available",
    description: "Modify a calendar event.",
    argumentNames: ["eventId", "changes"],
  },
] as const satisfies readonly ToolDefinition[];

function userError(
  code: UserFacingError["code"],
  message: string,
  retryable = false,
): UserFacingError {
  return { code, message, retryable };
}

function mapIntegrationResult(toolCallId: string, result: ToolResult): AgentToolResult {
  if (result.error) {
    if (result.isAuthMissing) {
      return {
        toolCallId,
        ok: false,
        error: userError("authentication_required", "Reconnect the integration to continue."),
        failure: { code: "auth_missing", retryable: false },
      };
    }
    if (result.isPermissionRequired) {
      return {
        toolCallId,
        ok: false,
        error: userError("permission_required", "The integration needs additional permission."),
        failure: { code: "permission_required", retryable: false },
      };
    }
    if (result.isRateLimited) {
      return {
        toolCallId,
        ok: false,
        error: userError("rate_limited", "The integration is temporarily rate-limited.", true),
        failure: { code: "rate_limited", retryable: true },
      };
    }
    return {
      toolCallId,
      ok: false,
      error: userError(
        "integration_unavailable",
        "The integration could not complete the request.",
        true,
      ),
      failure: { code: "integration_error", retryable: true },
    };
  }

  return { toolCallId, ok: true, content: result.content, data: result.data };
}

export class ToolRegistry {
  private readonly definitions: Map<string, ToolDefinition>;

  constructor(
    private readonly integration: IntegrationService,
    definitions: readonly ToolDefinition[] = TOOL_DEFINITIONS,
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  getDefinition(toolId: string): ToolDefinition {
    const definition = this.definitions.get(toolId);
    if (!definition) throw new ToolRegistryError(`Unknown tool: ${toolId}`);
    return definition;
  }

  async execute(request: RegistryToolCall, approved: boolean = false): Promise<AgentToolResult> {
    const definition = this.getDefinition(request.toolId);
    if (request.operation !== definition.operation) {
      throw new ToolRegistryError(
        `Tool ${request.toolId} is registered as ${definition.operation}, not ${request.operation}`,
      );
    }

    if (definition.availability !== "available") {
      return {
        toolCallId: request.id,
        ok: false,
        error: userError(
          "integration_unavailable",
          "This tool is not available until its integration is implemented.",
        ),
        failure: { code: "integration_error", retryable: false },
      };
    }

    if (definition.operation === "write" && !approved) {
      return {
        toolCallId: request.id,
        ok: false,
        error: {
          code: "approval_required",
          message: "This action must be approved before it can execute.",
          retryable: false,
          action: "review_approval",
        },
      };
    }

    if (!definition.action) {
      throw new ToolRegistryError(`Available tool ${request.toolId} has no integration action`);
    }

    const call: ToolCall = {
      plugin: definition.plugin,
      action: definition.action,
      args: request.args,
    };
    const result = await this.integration.executeTool(request.tenantId, call);
    return mapIntegrationResult(request.id, result);
  }
}
