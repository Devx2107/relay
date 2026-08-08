import { IntegrationService, ToolCall, ToolResult } from "./integration";

export class GmailService {
  constructor(private integration: IntegrationService) {}

  /**
   * Search for email threads.
   * By default, it queries the user's recent inbox.
   */
  async searchThreads(tenantId: string, query: string = "in:inbox", maxResults: number = 10): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "gmail",
      action: "api.threads.list",
      args: { q: query, maxResults }
    };
    
    return this.integration.executeTool(tenantId, call);
  }

  /**
   * Fetch the full details of a specific thread.
   */
  async getThread(tenantId: string, threadId: string): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "gmail",
      action: "api.threads.get",
      args: { id: threadId, format: "full" }
    };

    return this.integration.executeTool(tenantId, call);
  }
}
