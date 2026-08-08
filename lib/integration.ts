import { corsair } from "../corsair";

export interface ToolCall {
  plugin: string;
  action: string; // e.g., "api.messages.send"
  args: Record<string, any>;
}

export interface ToolResult {
  content: string;
  data?: any;
  error?: string;
}

export interface IntegrationService {
  executeTool(tenantId: string, call: ToolCall): Promise<ToolResult>;
}

export class CorsairIntegrationService implements IntegrationService {
  async executeTool(tenantId: string, call: ToolCall): Promise<ToolResult> {
    try {
      // Resolve tenant-scoped corsair instance if multi-tenant wrapper is used.
      const instance = (corsair as any).withTenant ? (corsair as any).withTenant(tenantId) : corsair;
      
      const pluginInstance = instance[call.plugin];
      if (!pluginInstance) {
        throw new Error(`Plugin ${call.plugin} not found or not configured.`);
      }

      // Navigate action path (e.g. "api.messages.send")
      const parts = call.action.split(".");
      let targetFn = pluginInstance;
      for (const part of parts) {
        targetFn = targetFn[part];
        if (!targetFn) {
           throw new Error(`Action ${call.action} not found on plugin ${call.plugin}.`);
        }
      }

      if (typeof targetFn !== "function") {
        throw new Error(`Action ${call.action} is not a function.`);
      }

      // Execute target function
      const result = await targetFn(call.args);
      return { content: "Success", data: result };

    } catch (error: any) {
      return { content: "", error: error.message || String(error) };
    }
  }
}
