import { IntegrationService, ToolCall, ToolResult } from "./integration";

export class MockIntegrationService implements IntegrationService {
  private mocks: Map<string, ToolResult> = new Map();
  private calls: Array<{ tenantId: string; call: ToolCall }> = [];

  /**
   * Register a mock response for a specific plugin and action.
   */
  mockResponse(plugin: string, action: string, result: ToolResult) {
    const key = `${plugin}:${action}`;
    this.mocks.set(key, result);
  }

  /**
   * Get all recorded tool calls.
   */
  getCalls() {
    return this.calls;
  }

  /**
   * Clear recorded calls and mock responses.
   */
  clear() {
    this.mocks.clear();
    this.calls = [];
  }

  async executeTool(tenantId: string, call: ToolCall): Promise<ToolResult> {
    this.calls.push({ tenantId, call });

    const key = `${call.plugin}:${call.action}`;
    const mockedResult = this.mocks.get(key);

    if (mockedResult) {
      return mockedResult;
    }

    return { content: "", error: `No mock provided for ${key}` };
  }
}
