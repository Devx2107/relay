import type { AgentRun, AgentProgressEvent, UserFacingError, AgentToolResult } from "./contracts";
import { parseCommand } from "./intents";
import type { GroqAdapter, GroqMessage, GroqTool } from "./groq";
import type { ToolRegistry, ToolDefinition } from "./tools";
import { TOOL_DEFINITIONS } from "./tools";

export interface AgentLoopOptions {
  runId: string;
  tenantId: string;
  conversationId: string;
  groq: GroqAdapter;
  registry: ToolRegistry;
  onProgress: (event: AgentProgressEvent) => void;
  onComplete: (run: AgentRun) => void;
}

export class AgentLoop {
  constructor(private readonly options: AgentLoopOptions) {}

  async execute(command: string, history: { role: string; content: string }[] = []): Promise<void> {
    const timestamp = () => new Date().toISOString();

    this.options.onProgress({
      runId: this.options.runId,
      status: "received",
      message: "Parsing intent...",
      createdAt: timestamp(),
    });

    const parsed = parseCommand(command, history);
    if (!parsed.ok) {
      this.failRun(parsed.error, "Failed to parse command.", timestamp());
      return;
    }

    const intent = parsed.intent;

    this.options.onProgress({
      runId: this.options.runId,
      status: "planning",
      message: "Planning execution...",
      createdAt: timestamp(),
    });

    const readTools = TOOL_DEFINITIONS.filter(
      (t) => t.operation === "read" && t.availability === "available",
    ).map(this.toGroqTool);

    const historyGroqMessages = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const messages: GroqMessage[] = [
      {
        role: "system",
        content:
          "You are an intelligent scheduling and triage assistant. Use available tools to gather necessary context. Return a tool call if you need more information.",
      },
      ...historyGroqMessages,
      {
        role: "user",
        content: `Fulfill the following intent: ${JSON.stringify(intent)}`,
      },
    ];

    const planResponse = await this.options.groq.complete(
      messages,
      "I need more context.",
      readTools,
    );

    if (planResponse.error) {
      this.failRun(planResponse.error, "Failed during planning phase.", timestamp());
      return;
    }

    if (planResponse.toolCalls && planResponse.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        tool_calls: planResponse.toolCalls,
      });

      for (const call of planResponse.toolCalls) {
        try {
          const args = JSON.parse(call.function.arguments);
          const toolDef = TOOL_DEFINITIONS.find((t) => t.id === call.function.name);

          if (toolDef) {
            this.options.onProgress({
              runId: this.options.runId,
              status: "reading",
              message: toolDef.description,
              createdAt: timestamp(),
            });

            const result = await this.options.registry.execute({
              id: call.id,
              tenantId: this.options.tenantId,
              toolId: toolDef.id,
              operation: toolDef.operation,
              args,
            });

            if (
              (result.failure?.code === "auth_missing" ||
                result.failure?.code === "permission_required") &&
              result.error
            ) {
              this.failRun(result.error, "Integration connection required.", timestamp());
              return;
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(result),
            });
          } else {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify({ ok: false, error: "Tool not found" }),
            });
          }
        } catch {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ ok: false, error: "Invalid tool arguments" }),
          });
        }
      }
    } else if (planResponse.text) {
      messages.push({
        role: "assistant",
        content: planResponse.text,
      });
    }

    this.options.onProgress({
      runId: this.options.runId,
      status: "planning",
      message: "Proposing action...",
      createdAt: timestamp(),
    });

    const writeTools = TOOL_DEFINITIONS.filter(
      (t) => t.operation === "write" && t.availability === "available",
    ).map(this.toGroqTool);

    messages.push({
      role: "user",
      content:
        "Based on the read data, propose the next action using write tools. If no write action is needed, provide a final summary.",
    });

    const proposeResponse = await this.options.groq.complete(
      messages,
      "I cannot propose an action at this time.",
      writeTools,
    );

    if (proposeResponse.error) {
      this.failRun(proposeResponse.error, "Failed during propose phase.", timestamp());
      return;
    }

    if (proposeResponse.toolCalls && proposeResponse.toolCalls.length > 0) {
      this.options.onProgress({
        runId: this.options.runId,
        status: "waiting_for_approval",
        message: "Action requires your approval.",
        createdAt: timestamp(),
      });

      this.options.onComplete({
        id: this.options.runId,
        conversationId: this.options.conversationId,
        status: "waiting_for_approval",
        intent,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        metadata: {
          proposedAction: proposeResponse.toolCalls[0].function.name,
          proposedArgs: proposeResponse.toolCalls[0].function.arguments,
        },
      });
      return;
    }

    this.options.onProgress({
      runId: this.options.runId,
      status: "completed",
      message: "Task completed successfully.",
      createdAt: timestamp(),
    });

    this.options.onComplete({
      id: this.options.runId,
      conversationId: this.options.conversationId,
      status: "completed",
      intent,
      createdAt: timestamp(),
      updatedAt: timestamp(),
      metadata: {
        finalSummary: proposeResponse.text || "Task completed successfully.",
      },
    });
  }

  async verify(
    run: AgentRun,
    writeCall: { action: string; args: Record<string, unknown> },
    result: AgentToolResult,
  ): Promise<void> {
    const timestamp = () => new Date().toISOString();

    this.options.onProgress({
      runId: this.options.runId,
      status: "verifying",
      message: "Verifying action result...",
      createdAt: timestamp(),
    });

    const messages: GroqMessage[] = [
      {
        role: "system",
        content:
          "You are an intelligent scheduling and triage assistant. Summarize the result of the action that was just executed for the user.",
      },
      {
        role: "user",
        content: `I approved the action "${writeCall.action}" with arguments: ${JSON.stringify(writeCall.args)}.`,
      },
      {
        role: "assistant",
        content: `I executed the action. Here is the result: ${JSON.stringify(result.data || result.content)}`,
      },
      {
        role: "user",
        content:
          "Please provide a final brief, user-readable summary of what was accomplished. Keep it concise.",
      },
    ];

    const verifyResponse = await this.options.groq.complete(
      messages,
      "The action was executed successfully.",
      [],
    );

    if (verifyResponse.error) {
      this.options.onProgress({
        runId: this.options.runId,
        status: "completed",
        message: "Action completed successfully.",
        createdAt: timestamp(),
      });
      this.options.onComplete({
        ...run,
        status: "completed",
        metadata: {
          ...run.metadata,
          finalSummary: "Action completed successfully.",
        },
        updatedAt: timestamp(),
      });
      return;
    }

    this.options.onProgress({
      runId: this.options.runId,
      status: "completed",
      message: "Task completed successfully.",
      createdAt: timestamp(),
    });

    this.options.onComplete({
      ...run,
      status: "completed",
      metadata: {
        ...run.metadata,
        finalSummary: verifyResponse.text,
      },
      updatedAt: timestamp(),
    });
  }

  private failRun(error: UserFacingError, message: string, timestamp: string) {
    this.options.onProgress({
      runId: this.options.runId,
      status: "failed",
      message,
      createdAt: timestamp,
    });
    this.options.onComplete({
      id: this.options.runId,
      conversationId: this.options.conversationId,
      status: "failed",
      error,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  private toGroqTool(def: ToolDefinition): GroqTool {
    return {
      type: "function",
      function: {
        name: def.id,
        description: def.description,
        parameters: {
          type: "object",
          properties: def.argumentNames.reduce(
            (acc, name) => {
              acc[name] = { type: "string" };
              return acc;
            },
            {} as Record<string, unknown>,
          ),
          required: [...def.argumentNames],
        },
      },
    };
  }
}
