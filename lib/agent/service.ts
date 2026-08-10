import { createClient } from "../supabase/server";
import { AgentLoop } from "./loop";
import { GroqAdapter } from "./groq";
import { CorsairIntegrationService } from "../integration";
import { GmailService } from "../gmail";
import type { AgentRun, AgentProgressEvent, AgentToolResult } from "./contracts";
import { TOOL_DEFINITIONS, ToolRegistry } from "./tools";
import { isValidTimeZone } from "./contracts";
import { executeSchedulingProposal, parseStoredSchedulingProposal } from "../scheduling-execution";

export function createRunPersistenceQueue() {
  let pending: Promise<void> = Promise.resolve();

  return {
    enqueue(task: () => Promise<void>) {
      pending = pending.then(task);
      return pending;
    },
    flush() {
      return pending;
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  accountEmail?: string;
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
    const gmail = new GmailService(integration);
    const registry = this.options.registryFactory
      ? this.options.registryFactory(integration)
      : new ToolRegistry(integration, undefined, async (tenantId, toolId, args) => {
          if (toolId === "gmail.send" || toolId === "gmail.reply_draft") {
            if (typeof args.threadId !== "string" || typeof args.body !== "string") {
              throw new Error("Invalid Gmail reply arguments.");
            }
            return toolId === "gmail.send"
              ? gmail.sendReply(tenantId, args.threadId, args.body)
              : gmail.createReplyDraft(tenantId, args.threadId, args.body);
          }
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
    const persistence = createRunPersistenceQueue();

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
      accountEmail: scheduleContext.accountEmail,
      onProgress: async (event) => {
        events.push(event);
        await persistence.enqueue(async () => {
          await supabase
            .from("agent_runs")
            .update({
              status: event.status,
              metadata: { ...run.metadata, progressEvents: events },
              updated_at: new Date().toISOString(),
            })
            .eq("id", run.id);
        });
      },
      onComplete: async (completedRun) => {
        await persistence.flush();
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
    const hasScheduleProposal = Boolean(metadata && metadata.scheduleProposal !== undefined);
    if (
      !metadata ||
      (!hasScheduleProposal &&
        (typeof metadata.proposedAction !== "string" || !metadata.proposedArgs))
    ) {
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
    const gmail = new GmailService(integration);
    const registry = this.options.registryFactory
      ? this.options.registryFactory(integration)
      : new ToolRegistry(integration, undefined, async (tenantId, toolId, args) => {
          if (toolId === "gmail.send" || toolId === "gmail.reply_draft") {
            if (typeof args.threadId !== "string" || typeof args.body !== "string") {
              throw new Error("Invalid Gmail reply arguments.");
            }
            return toolId === "gmail.send"
              ? gmail.sendReply(tenantId, args.threadId, args.body)
              : gmail.createReplyDraft(tenantId, args.threadId, args.body);
          }
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

    if (hasScheduleProposal) {
      return this.approveSchedulingRun(supabase, run, metadata, registry);
    }

    const events: AgentProgressEvent[] = metadata.progressEvents
      ? (metadata.progressEvents as AgentProgressEvent[])
      : [];
    const persistence = createRunPersistenceQueue();

    const loop = new AgentLoop({
      runId: run.id,
      tenantId: this.tenantId,
      conversationId: run.conversation_id,
      groq,
      registry,
      onProgress: async (event) => {
        events.push(event);
        await persistence.enqueue(async () => {
          await supabase
            .from("agent_runs")
            .update({
              status: event.status,
              metadata: { ...metadata, progressEvents: events },
              updated_at: new Date().toISOString(),
            })
            .eq("id", run.id);
        });
      },
      onComplete: async (completedRun) => {
        await persistence.flush();
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

    const toolDef = TOOL_DEFINITIONS.find((t) => t.id === metadata.proposedAction);
    const actionMessage = toolDef ? toolDef.description : "Executing action...";
    events.push({
      runId: run.id,
      status: "executing",
      message: actionMessage,
      createdAt: new Date().toISOString(),
    });

    const { data: claimedRun, error: claimError } = await supabase
      .from("agent_runs")
      .update({
        status: "executing",
        metadata: { ...metadata, progressEvents: events },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "waiting_for_approval")
      .select()
      .single();

    if (claimError || !claimedRun) {
      throw new Error("Run is no longer waiting for approval.");
    }

    try {
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

  async prepareCalendarCancellation(runId: string, eventId: string): Promise<AgentRun> {
    const supabase = await createClient();
    const { data: run, error } = await supabase
      .from("agent_runs")
      .select()
      .eq("id", runId)
      .single();
    if (error || !run || run.status !== "completed") {
      throw new Error("The meeting selection is no longer available.");
    }

    const metadata = isRecord(run.metadata) ? run.metadata : undefined;
    const events = Array.isArray(metadata?.calendarEvents) ? metadata.calendarEvents : [];
    const event = events.find(
      (candidate: unknown): candidate is Record<string, unknown> =>
        isRecord(candidate) && candidate.id === eventId && typeof candidate.calendarId === "string",
    );
    if (!event || metadata?.calendarAction !== "cancel") {
      throw new Error("That meeting is no longer available to cancel.");
    }

    const { data: updatedRun, error: updateError } = await supabase
      .from("agent_runs")
      .update({
        status: "waiting_for_approval",
        metadata: {
          ...metadata,
          selectedCalendarEventId: eventId,
          proposedAction: "calendar.delete_event",
          proposedArgs: JSON.stringify({
            calendarId: event.calendarId,
            id: eventId,
            sendUpdates: "all",
          }),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("status", "completed")
      .select()
      .single();

    if (updateError || !updatedRun)
      throw new Error("The meeting selection is no longer available.");
    return this.mapToAgentRun(updatedRun);
  }

  private async approveSchedulingRun(
    supabase: any,
    run: any,
    metadata: Record<string, unknown>,
    registry: ToolRegistry,
  ): Promise<AgentRun> {
    let proposal;
    try {
      proposal = parseStoredSchedulingProposal(metadata.scheduleProposal);
    } catch {
      throw new Error("The scheduling proposal is invalid.");
    }
    const events: AgentProgressEvent[] = Array.isArray(metadata.progressEvents)
      ? (metadata.progressEvents as AgentProgressEvent[])
      : [];
    const now = () => new Date().toISOString();
    events.push({
      runId: run.id,
      status: "executing",
      message: "Creating the approved calendar event and invitation.",
      createdAt: now(),
    });

    const { data: claimedRun, error: claimError } = await supabase
      .from("agent_runs")
      .update({
        status: "executing",
        metadata: { ...metadata, progressEvents: events },
        updated_at: now(),
      })
      .eq("id", run.id)
      .eq("status", "waiting_for_approval")
      .select()
      .single();
    if (claimError || !claimedRun) throw new Error("Run is no longer waiting for approval.");

    const result = await executeSchedulingProposal(registry, this.tenantId, proposal, run.id);
    if (!result.ok) {
      events.push({
        runId: run.id,
        status: "failed",
        message: result.partial
          ? "The event was created, but the optional invitation email could not be verified."
          : "The approved scheduling operation could not be completed.",
        createdAt: now(),
      });
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: JSON.stringify(result.error),
          metadata: {
            ...metadata,
            progressEvents: events,
            ...(result.partial ? { partialExecution: result.partial } : {}),
          },
          updated_at: now(),
        })
        .eq("id", run.id)
        .eq("status", "executing");
      return this.readRun(supabase, run.id);
    }

    events.push({
      runId: run.id,
      status: "verifying",
      message: "Verified the created event and invitation.",
      createdAt: now(),
    });
    events.push({
      runId: run.id,
      status: "completed",
      message: "The meeting and invitation were completed successfully.",
      createdAt: now(),
    });
    await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        metadata: {
          ...metadata,
          progressEvents: events,
          scheduleExecution: result.summary,
          finalSummary: "The calendar event and invitation were completed successfully.",
        },
        updated_at: now(),
      })
      .eq("id", run.id)
      .eq("status", "executing");
    return this.readRun(supabase, run.id);
  }

  private async readRun(supabase: any, runId: string): Promise<AgentRun> {
    const { data } = await supabase.from("agent_runs").select().eq("id", runId).single();
    if (!data) throw new Error("The updated run could not be read.");
    return this.mapToAgentRun(data);
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
