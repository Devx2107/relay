import { createClient } from "./supabase/server";
import { AgentService } from "./agent/service";
import { ToolRegistry } from "./agent/tools";
import { GmailService } from "./gmail";
import type { TriageItemStatus } from "./triage-items";

export type TriageAction = "reply" | "ignore" | "snooze";
export type SnoozePreset = "one_hour" | "tomorrow" | "next_week";

export interface CreateTriageActionRequest {
  conversationId: string;
  triageItemId: string;
  action: TriageAction;
  body?: string;
  snoozePreset?: SnoozePreset;
}

export interface TriageActionProposal {
  runId: string;
  triageItemId: string;
  action: TriageAction;
  status: "waiting_for_approval" | "completed" | "failed" | "cancelled";
  expiresAt: string;
  draftBody?: string;
}

export interface ReplyDraft {
  triageItemId: string;
  threadId: string;
  body: string;
  editable: true;
}

export class TriageActionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "authentication_required"
      | "invalid_request"
      | "not_found"
      | "conflict"
      | "integration_unavailable",
  ) {
    super(message);
    this.name = "TriageActionError";
  }
}

const PROPOSAL_TTL_MS = 15 * 60 * 1000;

function isAction(value: unknown): value is TriageAction {
  return value === "reply" || value === "ignore" || value === "snooze";
}

function isPreset(value: unknown): value is SnoozePreset {
  return value === "one_hour" || value === "tomorrow" || value === "next_week";
}

function snoozeUntil(preset: SnoozePreset): string {
  const duration =
    preset === "one_hour"
      ? 60 * 60 * 1000
      : preset === "tomorrow"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + duration).toISOString();
}

function safeRow(row: unknown):
  | {
      id: string;
      source: "email" | "calendar";
      source_id: string;
      status: TriageItemStatus;
      content: Record<string, unknown>;
    }
  | undefined {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const value = row as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    (value.source !== "email" && value.source !== "calendar") ||
    typeof value.source_id !== "string" ||
    (value.status !== "pending" && value.status !== "dismissed" && value.status !== "snoozed") ||
    !value.content ||
    typeof value.content !== "object" ||
    Array.isArray(value.content)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    source: value.source,
    source_id: value.source_id,
    status: value.status,
    content: value.content as Record<string, unknown>,
  };
}

function safeProposal(row: unknown): TriageActionProposal | undefined {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const value = row as Record<string, unknown>;
  const metadata = value.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const meta = metadata as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    typeof meta.triageItemId !== "string" ||
    !isAction(meta.action) ||
    typeof meta.expiresAt !== "string" ||
    (value.status !== "waiting_for_approval" &&
      value.status !== "completed" &&
      value.status !== "failed" &&
      value.status !== "cancelled")
  ) {
    return undefined;
  }
  return {
    runId: value.id,
    triageItemId: meta.triageItemId,
    action: meta.action,
    status: value.status,
    expiresAt: meta.expiresAt,
    draftBody: typeof meta.draftBody === "string" ? meta.draftBody : undefined,
  };
}

export class TriageActionService {
  constructor(private readonly createServerClient: typeof createClient = createClient) {}

  async prepareReplyDraft(
    request: Pick<CreateTriageActionRequest, "conversationId" | "triageItemId">,
  ): Promise<ReplyDraft> {
    const supabase = await this.createServerClient();
    const user = await this.requireUser(supabase);
    const item = await this.getPendingItem(supabase, user.id, request.triageItemId);
    this.requireReplyAction(item);
    await this.requireConversation(supabase, user.id, request.conversationId);

    return {
      triageItemId: item.id,
      threadId: item.source_id,
      body: "Hi,\n\nThanks for reaching out. I’ll review this and get back to you shortly.\n\nBest,\n",
      editable: true,
    };
  }

  async createProposal(request: CreateTriageActionRequest): Promise<TriageActionProposal> {
    const supabase = await this.createServerClient();
    const user = await this.requireUser(supabase);
    const item = await this.getPendingItem(supabase, user.id, request.triageItemId);
    const args = this.validateAndBuildArgs(request, item);

    const conversation = await this.requireConversation(supabase, user.id, request.conversationId);

    const { data: existingRuns } = await supabase
      .from("agent_runs")
      .select("id, status, metadata")
      .eq("conversation_id", conversation.id)
      .eq("status", "waiting_for_approval");
    const duplicate = (existingRuns ?? []).some((run: unknown) => {
      if (!run || typeof run !== "object" || Array.isArray(run)) return false;
      const metadata = (run as Record<string, unknown>).metadata;
      return (
        metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        (metadata as Record<string, unknown>).triageItemId === item.id
      );
    });
    if (duplicate)
      throw new TriageActionError(
        "An action for this item is already awaiting approval.",
        "conflict",
      );

    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({
        conversation_id: conversation.id,
        status: "waiting_for_approval",
        metadata: {
          proposedAction: this.toolId(request.action, item.source),
          proposedArgs: JSON.stringify(args),
          triageItemId: item.id,
          action: request.action,
          expiresAt,
          ...(request.action === "reply" ? { draftBody: args.body } : {}),
        },
      })
      .select("id, status, metadata")
      .single();
    if (error || !data) {
      throw new TriageActionError(
        "The action proposal could not be created.",
        "integration_unavailable",
      );
    }
    const proposal = safeProposal(data);
    if (!proposal)
      throw new TriageActionError("The action proposal is invalid.", "integration_unavailable");
    return proposal;
  }

  async listProposals(conversationId: string): Promise<TriageActionProposal[]> {
    const supabase = await this.createServerClient();
    const user = await this.requireUser(supabase);
    await this.requireConversation(supabase, user.id, conversationId);

    const { data, error } = await supabase
      .from("agent_runs")
      .select("id, status, metadata")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error)
      throw new TriageActionError(
        "Action proposals are temporarily unavailable.",
        "integration_unavailable",
      );
    return (data ?? [])
      .map(safeProposal)
      .filter((proposal): proposal is TriageActionProposal => Boolean(proposal));
  }

  async updateReplyProposal(runId: string, body: string): Promise<TriageActionProposal> {
    const supabase = await this.createServerClient();
    const user = await this.requireUser(supabase);
    const { data: run, error } = await supabase
      .from("agent_runs")
      .select("id, conversation_id, status, metadata")
      .eq("id", runId)
      .single();
    if (error || !run)
      throw new TriageActionError("The action proposal was not found.", "not_found");

    await this.requireConversation(supabase, user.id, run.conversation_id);
    if (run.status !== "waiting_for_approval")
      throw new TriageActionError("The action proposal is no longer pending.", "conflict");

    const metadata = run.metadata as Record<string, unknown> | null;
    if (!metadata || metadata.action !== "reply" || typeof metadata.triageItemId !== "string") {
      throw new TriageActionError("Only reply proposals can be edited.", "invalid_request");
    }
    const item = await this.getPendingItem(supabase, user.id, metadata.triageItemId);
    const args = this.validateAndBuildArgs(
      {
        conversationId: run.conversation_id,
        triageItemId: item.id,
        action: "reply",
        body,
      },
      item,
    );
    const { data, error: updateError } = await supabase
      .from("agent_runs")
      .update({
        metadata: { ...metadata, proposedArgs: JSON.stringify(args), draftBody: args.body },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .eq("status", "waiting_for_approval")
      .select("id, status, metadata")
      .single();
    if (updateError || !data)
      throw new TriageActionError(
        "The reply proposal could not be updated.",
        "integration_unavailable",
      );
    const proposal = safeProposal(data);
    if (!proposal)
      throw new TriageActionError("The action proposal is invalid.", "integration_unavailable");
    return proposal;
  }

  async approve(runId: string): Promise<unknown> {
    const supabase = await this.createServerClient();
    const user = await this.requireUser(supabase);
    const { data: run, error } = await supabase
      .from("agent_runs")
      .select("id, conversation_id, status, metadata")
      .eq("id", runId)
      .single();
    if (error || !run)
      throw new TriageActionError("The action proposal was not found.", "not_found");

    await this.requireConversation(supabase, user.id, run.conversation_id);

    const metadata = run.metadata as Record<string, unknown> | null;
    if (!metadata || typeof metadata.triageItemId !== "string" || !isAction(metadata.action)) {
      throw new TriageActionError("The action proposal is invalid.", "invalid_request");
    }
    if (run.status !== "waiting_for_approval") {
      throw new TriageActionError("The action proposal is no longer pending.", "conflict");
    }

    const item = await this.getPendingItem(supabase, user.id, metadata.triageItemId);
    const expectedTool = this.toolId(metadata.action, item.source);
    if (metadata.proposedAction !== expectedTool) {
      throw new TriageActionError(
        "The action proposal does not match the triage item.",
        "conflict",
      );
    }
    let proposedArgs: Record<string, unknown>;
    try {
      const parsed = JSON.parse(String(metadata.proposedArgs));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid");
      proposedArgs = parsed as Record<string, unknown>;
    } catch {
      throw new TriageActionError("The action proposal arguments are invalid.", "conflict");
    }
    if (!this.argumentsMatch(metadata.action, item, proposedArgs)) {
      throw new TriageActionError(
        "The action proposal arguments are stale or invalid.",
        "conflict",
      );
    }

    const service = new AgentService(user.id, {
      registryFactory: (integration) => {
        const gmail = new GmailService(integration);
        return new ToolRegistry(integration, undefined, async (tenantId, toolId, args) => {
          if (toolId === "gmail.send") {
            if (typeof args.threadId !== "string" || typeof args.body !== "string") {
              throw new Error("Invalid Gmail reply arguments.");
            }
            return gmail.sendReply(tenantId, args.threadId, args.body);
          }
          return { content: "Success" };
        });
      },
      afterApproved: async ({ toolId, toolArgs, metadata, result }) => {
        await this.applyCompletedState(supabase, user.id, toolId, toolArgs, metadata, result);
      },
    });
    return service.approveRun(runId);
  }

  private async requireUser(supabase: any): Promise<{ id: string }> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user)
      throw new TriageActionError("Sign in to manage triage actions.", "authentication_required");
    return { id: data.user.id };
  }

  private async requireConversation(supabase: any, userId: string, conversationId: string) {
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();
    if (error || !conversation) {
      throw new TriageActionError("The conversation was not found.", "not_found");
    }
    return conversation as { id: string };
  }

  private async getPendingItem(supabase: any, userId: string, itemId: string) {
    const { data, error } = await supabase
      .from("triage_items")
      .select("id, source, source_id, status, content")
      .eq("id", itemId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .single();
    const item = safeRow(data);
    if (error || !item)
      throw new TriageActionError("The triage item is no longer available.", "conflict");
    return item;
  }

  private validateAndBuildArgs(
    request: CreateTriageActionRequest,
    item: ReturnType<typeof safeRow>,
  ) {
    if (!item || !isAction(request.action))
      throw new TriageActionError("The action is invalid.", "invalid_request");
    const supportedActions = item.content.supportedActions;
    if (!Array.isArray(supportedActions) || !supportedActions.includes(request.action)) {
      throw new TriageActionError(
        "That action is not supported for this triage item.",
        "invalid_request",
      );
    }
    if (request.action === "reply") {
      this.requireReplyAction(item);
      if (
        typeof request.body !== "string" ||
        request.body.trim().length === 0 ||
        request.body.length > 5000
      )
        throw new TriageActionError("A valid email reply body is required.", "invalid_request");
      return { threadId: item.source_id, body: request.body.trim() };
    }
    if (request.action === "ignore") {
      return item.source === "email"
        ? { id: item.source_id, removeLabelIds: ["INBOX"] }
        : { triageItemId: item.id };
    }
    if (!isPreset(request.snoozePreset))
      throw new TriageActionError("Choose a supported snooze preset.", "invalid_request");
    return {
      triageItemId: item.id,
      preset: request.snoozePreset,
      snoozedUntil: snoozeUntil(request.snoozePreset),
    };
  }

  private toolId(action: TriageAction, source: "email" | "calendar"): string {
    if (action === "reply") return "gmail.send";
    if (action === "ignore") return source === "email" ? "gmail.archive_thread" : "triage.dismiss";
    return "triage.snooze";
  }

  private requireReplyAction(item: NonNullable<ReturnType<typeof safeRow>>) {
    const supportedActions = item.content.supportedActions;
    if (
      item.source !== "email" ||
      !Array.isArray(supportedActions) ||
      !supportedActions.includes("reply")
    ) {
      throw new TriageActionError(
        "Reply is not supported for this triage item.",
        "invalid_request",
      );
    }
  }

  private argumentsMatch(
    action: TriageAction,
    item: NonNullable<ReturnType<typeof safeRow>>,
    args: Record<string, unknown>,
  ): boolean {
    if (action === "reply") {
      return (
        item.source === "email" &&
        args.threadId === item.source_id &&
        typeof args.body === "string" &&
        args.body.trim().length > 0 &&
        args.body.length <= 5000
      );
    }
    if (action === "ignore") {
      return item.source === "email"
        ? args.id === item.source_id &&
            Array.isArray(args.removeLabelIds) &&
            args.removeLabelIds.length === 1 &&
            args.removeLabelIds[0] === "INBOX"
        : args.triageItemId === item.id;
    }
    if (
      args.triageItemId !== item.id ||
      !isPreset(args.preset) ||
      typeof args.snoozedUntil !== "string"
    ) {
      return false;
    }
    const until = new Date(args.snoozedUntil).getTime();
    const maxDuration = args.preset === "one_hour" ? 2 : args.preset === "tomorrow" ? 25 : 8 * 24;
    return (
      Number.isFinite(until) &&
      until > Date.now() &&
      until <= Date.now() + maxDuration * 60 * 60 * 1000
    );
  }

  private async applyCompletedState(
    supabase: any,
    userId: string,
    toolId: string,
    args: Record<string, unknown>,
    metadata: Record<string, unknown>,
    result: { error?: unknown },
  ) {
    if (!result || result.error)
      throw new TriageActionError("The action could not be completed.", "integration_unavailable");
    const itemId = typeof metadata.triageItemId === "string" ? metadata.triageItemId : undefined;
    const sourceId =
      toolId === "gmail.send"
        ? typeof args.threadId === "string"
          ? args.threadId
          : undefined
        : typeof args.id === "string"
          ? args.id
          : undefined;
    if ((toolId === "gmail.archive_thread" || toolId === "gmail.send") && (!sourceId || !itemId))
      throw new TriageActionError("The action arguments are invalid.", "invalid_request");
    if (toolId !== "gmail.archive_thread" && !itemId)
      throw new TriageActionError("The action arguments are invalid.", "invalid_request");

    let content: Record<string, unknown> | undefined;
    if (toolId === "triage.snooze") {
      const { data } = await supabase
        .from("triage_items")
        .select("content")
        .eq("id", itemId)
        .eq("user_id", userId)
        .eq("status", "pending")
        .single();
      content = data?.content && typeof data.content === "object" ? data.content : {};
      content = { ...content, snoozedUntil: args.snoozedUntil, snoozePreset: args.preset };
    }
    const update =
      toolId === "triage.snooze"
        ? { status: "snoozed", content, updated_at: new Date().toISOString() }
        : { status: "dismissed", updated_at: new Date().toISOString() };
    const query = supabase
      .from("triage_items")
      .update(update)
      .eq("user_id", userId)
      .eq("status", "pending");
    const { error } = await query.eq("id", itemId);
    if (error)
      throw new TriageActionError(
        "The triage item state could not be updated.",
        "integration_unavailable",
      );
  }
}
