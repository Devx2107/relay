import { createClient } from "../supabase/server";
import { AgentLoop } from "./loop";
import { GroqAdapter } from "./groq";
import { CorsairIntegrationService } from "../integration";
import type { AgentRun, AgentProgressEvent, AgentToolResult } from "./contracts";
import { TOOL_DEFINITIONS, ToolRegistry } from "./tools";
import { isValidTimeZone } from "./contracts";

export interface AgentServiceOptions {
  registryFactory?: (integration: CorsairIntegrationService) => ToolRegistry;
  afterApproved?: (args: {
    toolId: string;
    toolArgs: Record<string, unknown>;
    metadata: Record<string, unknown>;
    result: AgentToolResult;
  }) => Promise<void>;
}

export interface AgentScheduleContext {
  accountTimeZone?: string;
}

export class AgentService {
  constructor(
    private readonly tenantId: string,
    private readonly options: AgentServiceOptions = {},
  ) {}

  async startRun(
    conversationId: string,
    command: string,
    scheduleContext: AgentScheduleContext = {},
  ): Promise<AgentRun> {
    const supabase = await createClient();

    const { data: run, error } = await supabase
      .from("agent_runs")
      .insert({
        conversation_id: conversationId,
        status: "queued",
      })
      .select()
      .single();

    if (error || !run) {
      throw new Error(`Failed to create agent run: ${error?.message}`);
    }

    const groq = new GroqAdapter();
    const integration = new CorsairIntegrationService();
    const registry = this.options.registryFactory
      ? this.options.registryFactory(integration)
      : new ToolRegistry(integration, undefined, async (tenantId, toolId, args) => {
          const sb = await createClient();
          if (toolId === "triage.dismiss") {
            const { error } = await sb
              .from("triage_items")
              .update({ status: "dismissed", updated_at: new Date().toISOString() })
              .eq("user_id", tenantId)
              .eq("id", args.triageItemId as string);
            if (error) throw new Error("Failed to dismiss triage item.");
            return { content: "Dismissed successfully." };
          }
          if (toolId === "triage.snooze") {
            const preset = args.preset as string;
            const duration =
              preset === "one_hour"
                ? 60 * 60 * 1000
                : preset === "tomorrow"
                  ? 24 * 60 * 60 * 1000
                  : 7 * 24 * 60 * 60 * 1000;
            const snoozedUntil = new Date(Date.now() + duration).toISOString();

            const { data } = await sb
              .from("triage_items")
              .select("content")
              .eq("id", args.triageItemId as string)
              .eq("user_id", tenantId)
              .single();
            const content = { ...(data?.content || {}), snoozedUntil, snoozePreset: preset };

            const { error } = await sb
              .from("triage_items")
              .update({ status: "snoozed", content, updated_at: new Date().toISOString() })
              .eq("user_id", tenantId)
              .eq("id", args.triageItemId as string);
            if (error) throw new Error("Failed to snooze triage item.");
            return { content: "Snoozed successfully." };
          }
          throw new Error(`Unknown local tool: ${toolId}`);
        });

    const events: AgentProgressEvent[] = [];

    const loop = new AgentLoop({
      runId: run.id,
      tenantId: this.tenantId,
      conversationId,
      groq,
      registry,
      accountTimeZone:
        scheduleContext.accountTimeZone && isValidTimeZone(scheduleContext.accountTimeZone)
          ? scheduleContext.accountTimeZone
          : undefined,
      onProgress: async (event) => {
        events.push(event);
        await supabase
          .from("agent_runs")
          .update({
            status: event.status,
            metadata: { ...run.metadata, progressEvents: events },
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      },
      onComplete: async (completedRun) => {
        await supabase
          .from("agent_runs")
          .update({
            status: completedRun.status,
            error: completedRun.error ? JSON.stringify(completedRun.error) : null,
            metadata: { ...completedRun.metadata, progressEvents: events },
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      },
    });

    const { data: messagesData } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(10);

    await loop.execute(command, messagesData ?? []);

    const { data: updatedRun } = await supabase
      .from("agent_runs")
      .select()
      .eq("id", run.id)
      .single();

    return this.mapToAgentRun(updatedRun);
  }

  async approveRun(runId: string): Promise<AgentRun> {
    const supabase = await createClient();

    const { data: run, error } = await supabase
      .from("agent_runs")
      .select()
      .eq("id", runId)
      .single();

    if (error || !run) {
      throw new Error("Run not found.");
    }

    if (run.status !== "waiting_for_approval") {
      throw new Error("Run is not waiting for approval.");
    }

    const metadata = run.metadata as Record<string, unknown> | null;
    if (!metadata || typeof metadata.proposedAction !== "string" || !metadata.proposedArgs) {
      throw new Error("Run metadata does not contain a proposed action.");
    }
    if (
      typeof metadata.expiresAt === "string" &&
      new Date(metadata.expiresAt).getTime() <= Date.now()
    ) {
      throw new Error("The approval proposal has expired.");
    }

    const groq = new GroqAdapter();
    const integration = new CorsairIntegrationService();
    const registry = this.options.registryFactory
      ? this.options.registryFactory(integration)
      : new ToolRegistry(integration, undefined, async (tenantId, toolId, args) => {
          const sb = await createClient();
          if (toolId === "triage.dismiss") {
            const { error } = await sb
              .from("triage_items")
              .update({ status: "dismissed", updated_at: new Date().toISOString() })
              .eq("user_id", tenantId)
              .eq("id", args.triageItemId as string);
            if (error) throw new Error("Failed to dismiss triage item.");
            return { content: "Dismissed successfully." };
          }
          if (toolId === "triage.snooze") {
            const preset = args.preset as string;
            const duration =
              preset === "one_hour"
                ? 60 * 60 * 1000
                : preset === "tomorrow"
                  ? 24 * 60 * 60 * 1000
                  : 7 * 24 * 60 * 60 * 1000;
            const snoozedUntil = new Date(Date.now() + duration).toISOString();

            const { data } = await sb
              .from("triage_items")
              .select("content")
              .eq("id", args.triageItemId as string)
              .eq("user_id", tenantId)
              .single();
            const content = { ...(data?.content || {}), snoozedUntil, snoozePreset: preset };

            const { error } = await sb
              .from("triage_items")
              .update({ status: "snoozed", content, updated_at: new Date().toISOString() })
              .eq("user_id", tenantId)
              .eq("id", args.triageItemId as string);
            if (error) throw new Error("Failed to snooze triage item.");
            return { content: "Snoozed successfully." };
          }
          throw new Error(`Unknown local tool: ${toolId}`);
        });

    const events: AgentProgressEvent[] = metadata.progressEvents
      ? (metadata.progressEvents as AgentProgressEvent[])
      : [];

    const loop = new AgentLoop({
      runId: run.id,
      tenantId: this.tenantId,
      conversationId: run.conversation_id,
      groq,
      registry,
      onProgress: async (event) => {
        events.push(event);
        await supabase
          .from("agent_runs")
          .update({
            status: event.status,
            metadata: { ...metadata, progressEvents: events },
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      },
      onComplete: async (completedRun) => {
        await supabase
          .from("agent_runs")
          .update({
            status: completedRun.status,
            error: completedRun.error ? JSON.stringify(completedRun.error) : null,
            metadata: { ...completedRun.metadata, progressEvents: events },
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      },
    });

    try {
      const toolDef = TOOL_DEFINITIONS.find((t) => t.id === metadata.proposedAction);
      const actionMessage = toolDef ? toolDef.description : "Executing action...";

      events.push({
        runId: run.id,
        status: "executing",
        message: actionMessage,
        createdAt: new Date().toISOString(),
      });

      await supabase
        .from("agent_runs")
        .update({
          status: "executing",
          metadata: { ...metadata, progressEvents: events },
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      const result = await registry.execute(
        {
          id: "approved-call",
          tenantId: this.tenantId,
          toolId: metadata.proposedAction as string,
          operation: "write",
          args: JSON.parse(metadata.proposedArgs as string),
        },
        true,
      );

      if (!result.ok) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error: JSON.stringify(result.error),
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      } else {
        if (this.options.afterApproved) {
          await this.options.afterApproved({
            toolId: metadata.proposedAction as string,
            toolArgs: JSON.parse(metadata.proposedArgs as string),
            metadata,
            result,
          });
        }
        await loop.verify(
          this.mapToAgentRun(run),
          {
            action: metadata.proposedAction as string,
            args: JSON.parse(metadata.proposedArgs as string),
          },
          result,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: JSON.stringify({
            code: "execution_failed",
            message,
            retryable: false,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    const { data: updatedRun } = await supabase
      .from("agent_runs")
      .select()
      .eq("id", run.id)
      .single();

    return this.mapToAgentRun(updatedRun);
  }

  async cancelRun(runId: string): Promise<AgentRun> {
    const supabase = await createClient();
    const { data: run, error } = await supabase
      .from("agent_runs")
      .select()
      .eq("id", runId)
      .single();

    if (error || !run) throw new Error("Run not found.");
    if (run.status !== "waiting_for_approval") {
      throw new Error("Run is no longer waiting for approval.");
    }

    const { data: updatedRun, error: updateError } = await supabase
      .from("agent_runs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("status", "waiting_for_approval")
      .select()
      .single();

    if (updateError || !updatedRun) throw new Error("The approval could not be cancelled.");
    return this.mapToAgentRun(updatedRun);
  }

  private mapToAgentRun(row: any): AgentRun {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      error: row.error
        ? typeof row.error === "string"
          ? JSON.parse(row.error)
          : row.error
        : undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
