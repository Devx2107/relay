import type { AgentRun, AgentProgressEvent, UserFacingError, AgentToolResult } from "./contracts";
import {
  hasScheduleTimeConstraint,
  isHelpCommand,
  parseCommand,
  requestsSchedulingClarification,
} from "./intents";
import type { GroqAdapter, GroqMessage, GroqTool } from "./groq";
import type { ToolRegistry, ToolDefinition } from "./tools";
import { TOOL_DEFINITIONS } from "./tools";
import { AvailabilityDataError, findAvailableSlots } from "../scheduling-availability";
import { buildSchedulingProposal } from "../scheduling-proposal";
import type { AvailableSlot } from "../scheduling-availability";
import { parseExplicitScheduleWindow, ScheduleOptionsError } from "../scheduling";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAvailabilityPayload(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.calendars)) return value;
  if (isRecord(value) && isRecord(value.data) && isRecord(value.data.calendars)) {
    return value.data;
  }
  return value;
}

function timedBusyIntervalsFromEvents(value: unknown): Array<{ start: string; end: string }> {
  const payload = normalizeAvailabilityPayload(value);
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new AvailabilityDataError("Primary calendar events were unavailable.");
  }

  return payload.items.map((event) => {
    if (!isRecord(event) || !isRecord(event.start) || !isRecord(event.end)) {
      throw new AvailabilityDataError("Primary calendar event data was malformed.");
    }
    const start = event.start.dateTime ?? event.start.date;
    const end = event.end.dateTime ?? event.end.date;
    if (typeof start !== "string" || typeof end !== "string") {
      throw new AvailabilityDataError("Primary calendar event data was incomplete.");
    }
    return { start, end };
  });
}

function availabilityPayloadDiagnostics(value: unknown) {
  if (!isRecord(value) || !isRecord(value.calendars)) {
    return {
      payloadShape: "missing_calendars_object",
      topLevelKeys: isRecord(value) ? Object.keys(value) : [],
    };
  }

  return {
    calendarKeys: Object.keys(value.calendars),
    calendars: Object.entries(value.calendars).map(([key, calendar]) => {
      if (!isRecord(calendar)) return { key, payloadShape: "invalid_calendar" };
      const busy = Array.isArray(calendar.busy) ? calendar.busy : [];
      const errors = Array.isArray(calendar.errors) ? calendar.errors : [];
      return {
        key,
        busyCount: busy.length,
        busyIntervals: busy
          .slice(0, 20)
          .map((interval) =>
            isRecord(interval)
              ? { start: interval.start ?? null, end: interval.end ?? null }
              : { valueType: typeof interval },
          ),
        errors: errors
          .slice(0, 10)
          .map((error) =>
            isRecord(error)
              ? { domain: error.domain ?? null, reason: error.reason ?? null }
              : { valueType: typeof error },
          ),
      };
    }),
  };
}

function firstCalendarEventForAction(
  messages: readonly GroqMessage[],
): { calendarId: string; id: string } | undefined {
  const findEvent = (value: unknown): Record<string, unknown> | undefined => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const event = findEvent(item);
        if (event) return event;
      }
      return undefined;
    }
    if (!isRecord(value)) return undefined;
    if (
      typeof value.id === "string" &&
      value.id.length > 0 &&
      (isRecord(value.start) || isRecord(value.end) || typeof value.summary === "string")
    ) {
      return value;
    }
    for (const key of ["items", "events", "data", "result"]) {
      const event = findEvent(value[key]);
      if (event) return event;
    }
    return undefined;
  };

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role !== "tool" ||
      (message.name !== "calendar.get_upcoming_events" && message.name !== "calendar.get_event")
    ) {
      continue;
    }
    try {
      const parsed = JSON.parse(message.content ?? "");
      const event = findEvent(parsed);
      if (event) {
        return {
          calendarId: typeof event.calendarId === "string" ? event.calendarId : "primary",
          id: event.id as string,
        };
      }
    } catch {
      // Continue looking for a usable calendar read result.
    }
  }
  return undefined;
}

export interface AgentLoopOptions {
  runId: string;
  tenantId: string;
  conversationId: string;
  groq: GroqAdapter;
  registry: ToolRegistry;
  accountTimeZone?: string;
  accountEmail?: string;
  onProgress: (event: AgentProgressEvent) => void | Promise<void>;
  onComplete: (run: AgentRun) => void | Promise<void>;
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

    if (isHelpCommand(command)) {
      const helpSummary =
        "I can help with two things: triage your inbox and schedule Google Calendar meetings. " +
        "For triage, ask me to review, summarize, archive, reply, or snooze email items; write actions require approval. " +
        "For scheduling, ask me to check your primary calendar and create a Google Calendar event with attendees, time zones, location, agenda, one-off details, and Google Meet; event creation requires approval. " +
        "I can also reschedule or cancel existing calendar events after reading the relevant event and receiving your approval. Recurring events and reminders are supported; cross-calendar synchronization is not yet supported.";
      await this.options.onProgress({
        runId: this.options.runId,
        status: "completed",
        message: "Here is what I can do.",
        createdAt: timestamp(),
      });
      await this.options.onComplete({
        id: this.options.runId,
        conversationId: this.options.conversationId,
        status: "completed",
        createdAt: timestamp(),
        updatedAt: timestamp(),
        metadata: { finalSummary: helpSummary },
      });
      return;
    }

    const parsed = parseCommand(command, history, {
      accountTimeZone: this.options.accountTimeZone,
    });
    if (!parsed.ok) {
      this.failRun(parsed.error, "Failed to parse command.", timestamp());
      return;
    }

    const intent = parsed.intent;

    if (
      intent.kind === "schedule" &&
      (requestsSchedulingClarification(command) ||
        !hasScheduleTimeConstraint(command) ||
        intent.parameters.attendeeStatus === "unresolved")
    ) {
      const clarification =
        intent.parameters.attendeeStatus === "unresolved"
          ? "I need a verified email address for the attendee before scheduling. Please provide the attendee's email, along with the date and time, location, agenda or purpose, and whether it is one-off or recurring."
          : "To schedule the meeting, please provide the date and time, attendees (if any), location, agenda or purpose, and whether it is one-off or recurring. Event creation will require your approval.";
      await this.options.onProgress({
        runId: this.options.runId,
        status: "completed",
        message: "More meeting details are required.",
        createdAt: timestamp(),
      });
      await this.options.onComplete({
        id: this.options.runId,
        conversationId: this.options.conversationId,
        status: "completed",
        intent,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        metadata: { finalSummary: clarification },
      });
      return;
    }

    this.options.onProgress({
      runId: this.options.runId,
      status: "planning",
      message: "Planning execution...",
      createdAt: timestamp(),
    });

    const readToolDefinitions = TOOL_DEFINITIONS.filter(
      (t) =>
        t.operation === "read" &&
        t.availability === "available" &&
        (intent.kind !== "schedule" || t.id === "calendar.check_availability"),
    );
    const readTools = readToolDefinitions.map(this.toGroqTool);

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
    let scheduleAvailabilityProcessed = false;
    let scheduleSlots: AvailableSlot[] | undefined;
    let scheduleAvailabilityUnavailable = false;
    let scheduleAvailabilityDiagnostics: Record<string, unknown> | undefined;
    const scheduleCalendarIds =
      intent.kind === "schedule" &&
      (intent.parameters.attendeeStatus === "provided" ||
        intent.parameters.attendeeStatus === "missing")
        ? ["primary"]
        : undefined;

    let explicitAvailabilityArgs:
      { timeMin: string; timeMax: string; items: { id: string }[] } | undefined;
    if (
      intent.kind === "schedule" &&
      (intent.parameters.attendeeStatus === "provided" ||
        intent.parameters.attendeeStatus === "missing")
    ) {
      try {
        const window = parseExplicitScheduleWindow(
          intent.parameters.request,
          intent.parameters.options.timeZone,
        );
        if (window && scheduleCalendarIds) {
          explicitAvailabilityArgs = {
            ...window,
            items: scheduleCalendarIds.map((id) => ({ id })),
          };
        }
      } catch (error) {
        this.failRun(
          {
            code: "invalid_request",
            message:
              error instanceof ScheduleOptionsError
                ? error.message
                : "The requested time window is invalid.",
            retryable: false,
          },
          "Failed to parse scheduling window.",
          timestamp(),
        );
        return;
      }
    }

    let planResponse;
    const calendarManagementRead =
      intent.kind === "triage" &&
      intent.parameters.source === "calendar" &&
      Boolean(intent.parameters.calendarAction);
    if (explicitAvailabilityArgs) {
      planResponse = {
        toolCalls: [
          {
            id: `${this.options.runId}:availability`,
            type: "function" as const,
            function: {
              name: "calendar.check_availability",
              arguments: JSON.stringify(explicitAvailabilityArgs),
            },
          },
        ],
        usedFallback: true,
      };
    } else if (calendarManagementRead) {
      planResponse = {
        toolCalls: [
          {
            id: this.options.runId + ":calendar-events",
            type: "function" as const,
            function: {
              name: "calendar.get_upcoming_events",
              arguments: JSON.stringify({
                calendarId: "primary",
                timeMin: new Date().toISOString(),
                maxResults: 50,
                singleEvents: true,
                orderBy: "startTime",
              }),
            },
          },
        ],
        usedFallback: true,
      };
    } else {
      try {
        planResponse = await this.options.groq.complete(
          messages,
          "I need more context.",
          readTools,
          intent.kind === "schedule" &&
            (intent.parameters.attendeeStatus === "provided" ||
              intent.parameters.attendeeStatus === "missing")
            ? "calendar.check_availability"
            : undefined,
        );
      } catch {
        this.failRun(
          {
            code: "integration_unavailable",
            message: "The language assistant could not plan this request.",
            retryable: true,
            action: "retry",
          },
          "Failed during planning phase.",
          timestamp(),
        );
        return;
      }
    }

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

          if (toolDef && toolDef.operation === "read" && toolDef.availability === "available") {
            this.options.onProgress({
              runId: this.options.runId,
              status: "reading",
              message: toolDef.description,
              createdAt: timestamp(),
            });

            const normalizedArgs =
              intent.kind === "schedule" && toolDef.id === "calendar.check_availability"
                ? { ...args, items: (scheduleCalendarIds ?? []).map((id) => ({ id })) }
                : args;
            const result = await this.options.registry.execute({
              id: call.id,
              tenantId: this.options.tenantId,
              toolId: toolDef.id,
              operation: toolDef.operation,
              args: normalizedArgs,
            });

            if (
              (result.failure?.code === "auth_missing" ||
                result.failure?.code === "permission_required") &&
              result.error
            ) {
              this.failRun(result.error, "Integration connection required.", timestamp());
              return;
            }

            let safeResult = result;
            if (
              intent.kind === "schedule" &&
              toolDef.id === "calendar.check_availability" &&
              result.ok
            ) {
              scheduleAvailabilityProcessed = true;
              try {
                const options = intent.parameters.options;
                let availabilityPayload = normalizeAvailabilityPayload(result.data);
                if (!isRecord(availabilityPayload) || !isRecord(availabilityPayload.calendars)) {
                  const primaryEvents = await this.options.registry.execute({
                    id: `${call.id}:primary-events`,
                    tenantId: this.options.tenantId,
                    toolId: "calendar.get_upcoming_events",
                    operation: "read",
                    args: {
                      calendarId: "primary",
                      timeMin: args.timeMin,
                      timeMax: args.timeMax,
                      maxResults: 100,
                      singleEvents: true,
                      orderBy: "startTime",
                    },
                  });
                  if (!primaryEvents.ok) {
                    throw new AvailabilityDataError("Primary calendar events were unavailable.");
                  }
                  availabilityPayload = {
                    calendars: {
                      primary: { busy: timedBusyIntervalsFromEvents(primaryEvents.data) },
                    },
                  };
                  scheduleAvailabilityDiagnostics = {
                    fallback: "calendar.get_upcoming_events",
                  };
                }
                const slots = findAvailableSlots(
                  {
                    attendees: scheduleCalendarIds ?? ["primary"],
                    windowStart: String(args.timeMin ?? ""),
                    windowEnd: String(args.timeMax ?? ""),
                    durationMinutes: options.durationMinutes,
                    timeZone: options.timeZone,
                    maxResults: 3,
                    allowOutsideWorkday: Boolean(explicitAvailabilityArgs),
                  },
                  availabilityPayload as {
                    calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
                  },
                );
                scheduleSlots = slots;
                scheduleAvailabilityDiagnostics = {
                  request: {
                    attendees: intent.parameters.attendees,
                    calendarIds: scheduleCalendarIds ?? intent.parameters.attendees,
                    accountEmailPresent: Boolean(this.options.accountEmail),
                    accountEmailMatched:
                      Boolean(this.options.accountEmail) &&
                      (intent.parameters.attendees ?? []).some(
                        (attendee) =>
                          attendee.toLowerCase() === this.options.accountEmail?.toLowerCase(),
                      ),
                    timeMin: args.timeMin ?? null,
                    timeMax: args.timeMax ?? null,
                    timeZone: options.timeZone,
                    durationMinutes: options.durationMinutes,
                  },
                  payload: availabilityPayloadDiagnostics(availabilityPayload),
                  computedSlotCount: slots.length,
                };
                safeResult = { ...result, data: { slots } };
              } catch (error) {
                scheduleAvailabilityUnavailable =
                  error instanceof AvailabilityDataError &&
                  /unavailable|incomplete/i.test(error.message);
                scheduleAvailabilityDiagnostics = {
                  request: {
                    attendees: intent.parameters.attendees,
                    calendarIds: scheduleCalendarIds ?? intent.parameters.attendees,
                    accountEmailPresent: Boolean(this.options.accountEmail),
                    accountEmailMatched:
                      Boolean(this.options.accountEmail) &&
                      (intent.parameters.attendees ?? []).some(
                        (attendee) =>
                          attendee.toLowerCase() === this.options.accountEmail?.toLowerCase(),
                      ),
                    timeMin: args.timeMin ?? null,
                    timeMax: args.timeMax ?? null,
                    timeZone: intent.parameters.options.timeZone,
                    durationMinutes: intent.parameters.options.durationMinutes,
                  },
                  payload: availabilityPayloadDiagnostics(
                    normalizeAvailabilityPayload(result.data),
                  ),
                  computationError:
                    error instanceof AvailabilityDataError ? error.message : "unknown_error",
                  computedSlotCount: 0,
                };
                safeResult = {
                  toolCallId: result.toolCallId,
                  ok: false,
                  error: {
                    code: "integration_unavailable",
                    message:
                      error instanceof AvailabilityDataError
                        ? "Verified calendar availability was unavailable."
                        : "Verified calendar availability could not be calculated.",
                    retryable: true,
                    action: "retry",
                  },
                  failure: { code: "integration_error", retryable: true },
                };
              }
            }

            if (
              intent.kind === "schedule" &&
              toolDef.id === "calendar.check_availability" &&
              !result.ok
            ) {
              scheduleAvailabilityProcessed = true;
              scheduleAvailabilityUnavailable = true;
              scheduleAvailabilityDiagnostics = {
                request: {
                  attendees: intent.parameters.attendees ?? [],
                  calendarIds: scheduleCalendarIds ?? intent.parameters.attendees ?? [],
                  accountEmailPresent: Boolean(this.options.accountEmail),
                  accountEmailMatched:
                    Boolean(this.options.accountEmail) &&
                    (intent.parameters.attendees ?? []).some(
                      (attendee) =>
                        attendee.toLowerCase() === this.options.accountEmail?.toLowerCase(),
                    ),
                  timeMin: args.timeMin ?? null,
                  timeMax: args.timeMax ?? null,
                  timeZone: intent.parameters.options.timeZone,
                  durationMinutes: intent.parameters.options.durationMinutes,
                },
                providerResult: {
                  errorCode: result.error?.code ?? null,
                  failureCode: result.failure?.code ?? null,
                },
                computedSlotCount: 0,
              };
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: JSON.stringify(safeResult),
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

    if (intent.kind === "schedule" && scheduleAvailabilityProcessed) {
      if (!scheduleSlots || scheduleSlots.length === 0) {
        const outcome = scheduleAvailabilityUnavailable
          ? "availability_unavailable"
          : "no_availability";
        const finalSummary = scheduleAvailabilityUnavailable
          ? "Calendar availability could not be verified for one or more attendees. Ask the attendee to share calendar availability or retry with a different verified attendee."
          : "No verified availability was found for the requested constraints.";
        console.info(
          "[Relay availability diagnostics]",
          JSON.stringify({
            runId: this.options.runId,
            ...(scheduleAvailabilityDiagnostics ?? { diagnosticStatus: "unavailable" }),
          }),
        );
        await this.options.onProgress({
          runId: this.options.runId,
          status: "completed",
          message: scheduleAvailabilityUnavailable
            ? "Calendar availability could not be verified."
            : "No verified availability was found.",
          createdAt: timestamp(),
        });
        await this.options.onComplete({
          id: this.options.runId,
          conversationId: this.options.conversationId,
          status: "completed",
          intent,
          createdAt: timestamp(),
          updatedAt: timestamp(),
          metadata: {
            outcome,
            finalSummary,
          },
        });
        return;
      }

      const proposal = buildSchedulingProposal(intent, scheduleSlots);
      await this.options.onProgress({
        runId: this.options.runId,
        status: "waiting_for_approval",
        message: "A combined meeting proposal is ready for approval.",
        createdAt: timestamp(),
      });
      await this.options.onComplete({
        id: this.options.runId,
        conversationId: this.options.conversationId,
        status: "waiting_for_approval",
        intent,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        metadata: {
          scheduleProposal: proposal,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });
      return;
    }

    if (intent.kind === "schedule" && !scheduleAvailabilityProcessed) {
      this.failRun(
        {
          code: "integration_unavailable",
          message: "Verified calendar availability could not be confirmed.",
          retryable: true,
          action: "retry",
        },
        "Availability verification is required before scheduling.",
        timestamp(),
      );
      return;
    }

    // Triage commands are read-only. Consequential triage actions are created
    // through the dedicated triage-action service, where the item owner,
    // source, status, and arguments are revalidated before approval.
    if (intent.kind === "triage" && !intent.parameters.calendarAction) {
      let summary = planResponse.text;
      if (!summary) {
        try {
          // A no-tool completion cannot contain an assistant tool call or a
          // tool-role message. Convert the read transcript into ordinary
          // bounded context before asking Groq for the summary.
          const summaryMessages: GroqMessage[] = messages.flatMap((message) => {
            if (message.role === "tool") {
              return [
                {
                  role: "user" as const,
                  content: `Read result from ${message.name ?? "the requested source"}: ${message.content ?? ""}`,
                },
              ];
            }
            if (message.role === "assistant" && message.tool_calls) {
              return [
                {
                  role: "assistant" as const,
                  content: message.content ?? "I reviewed the requested information.",
                },
              ];
            }
            return [message];
          });
          const summaryResponse = await this.options.groq.complete(
            [
              ...summaryMessages,
              {
                role: "user",
                content:
                  "Summarize the read results for the user. Do not propose or execute any write action.",
              },
            ],
            "I reviewed the requested information.",
            [],
          );
          if (summaryResponse.error) {
            this.failRun(summaryResponse.error, "Failed during summary phase.", timestamp());
            return;
          }
          summary = summaryResponse.text;
        } catch {
          this.failRun(
            {
              code: "integration_unavailable",
              message: "The language assistant could not summarize this request.",
              retryable: true,
              action: "retry",
            },
            "Failed during summary phase.",
            timestamp(),
          );
          return;
        }
      }

      this.options.onProgress({
        runId: this.options.runId,
        status: "completed",
        message: "Read-only triage completed.",
        createdAt: timestamp(),
      });
      this.options.onComplete({
        id: this.options.runId,
        conversationId: this.options.conversationId,
        status: "completed",
        intent,
        createdAt: timestamp(),
        updatedAt: timestamp(),
        metadata: { finalSummary: summary || "I reviewed the requested information." },
      });
      return;
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
        intent.kind === "triage" && intent.parameters.calendarAction === "cancel"
          ? "The user requested cancellation of the referenced calendar meeting or event. Propose calendar.delete_event with the exact calendarId and event id from the read result. This is consequential and must remain pending approval."
          : intent.kind === "triage" && intent.parameters.calendarAction === "reschedule"
            ? "The user requested rescheduling of the referenced calendar meeting or event. Propose calendar.modify_event using the exact calendarId and event id from the read result, preserving existing event details unless the user supplied changes. This is consequential and must remain pending approval."
            : "Based on the read data, propose the next action using write tools. If no write action is needed, provide a final summary.",
    });

    let proposeResponse;
    try {
      const forcedWriteTool =
        intent.kind === "triage" && intent.parameters.calendarAction === "cancel"
          ? "calendar.delete_event"
          : intent.kind === "triage" && intent.parameters.calendarAction === "reschedule"
            ? "calendar.modify_event"
          : undefined;
      const cancelEvent =
        intent.kind === "triage" && intent.parameters.calendarAction === "cancel"
          ? firstCalendarEventForAction(messages)
          : undefined;
      proposeResponse = cancelEvent
        ? {
            text: "",
            usedFallback: false,
            toolCalls: [
              {
                id: this.options.runId + ":calendar-delete",
                type: "function" as const,
                function: {
                  name: "calendar.delete_event",
                  arguments: JSON.stringify({
                    calendarId: cancelEvent.calendarId,
                    id: cancelEvent.id,
                    sendUpdates: "all",
                  }),
                },
              },
            ],
          }
        : await this.options.groq.complete(
            messages,
            "I cannot propose an action at this time.",
            writeTools,
            forcedWriteTool,
          );
    } catch {
      this.failRun(
        {
          code: "integration_unavailable",
          message: "The language assistant could not prepare the next action.",
          retryable: true,
          action: "retry",
        },
        "Failed during propose phase.",
        timestamp(),
      );
      return;
    }

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
    const optional = new Set([
      "calendarId",
      "maxResults",
      "singleEvents",
      "orderBy",
      "format",
      "sendUpdates",
      "conferenceDataVersion",
    ]);
    const typeByName: Record<string, Record<string, unknown>> = {
      maxResults: { type: "integer", minimum: 1, maximum: 100 },
      conferenceDataVersion: { type: "integer", minimum: 1, maximum: 1 },
      sendUpdates: { type: "string", enum: ["all", "externalOnly", "none"] },
      timeMin: { type: "string", format: "date-time" },
      timeMax: { type: "string", format: "date-time" },
      singleEvents: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string", minLength: 1 } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      attendees: { type: "array", items: { type: "string" } },
      changes: { type: "object" },
      event: { type: "object" },
    };

    return {
      type: "function",
      function: {
        name: def.id,
        description: def.description,
        parameters: {
          type: "object",
          properties: def.argumentNames.reduce(
            (acc, name) => {
              acc[name] = typeByName[name] ?? { type: "string" };
              return acc;
            },
            {} as Record<string, unknown>,
          ),
          required: def.argumentNames.filter((name) => !optional.has(name)),
          additionalProperties: false,
        },
      },
    };
  }
}
