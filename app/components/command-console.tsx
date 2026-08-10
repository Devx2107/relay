"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FloatingComposer } from "./floating-composer";

interface CommandConsoleProps {
  email: string;
}

interface BriefingItem {
  id: string;
  source: "email" | "calendar";
  content: {
    summary: string;
    reason: string;
    urgency: "low" | "medium" | "high";
    supportedActions: string[];
  };
}

interface BriefingResponse {
  items: BriefingItem[];
  sourceStatus?: Record<
    string,
    {
      state: "available" | "unavailable";
      error?: { code?: string; message?: string; retryable?: boolean };
    }
  >;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface Run {
  id: string;
  status: string;
  metadata?: {
    progressEvents?: Array<{ status: string; message: string }>;
    finalSummary?: string;
    outcome?: "no_availability" | "availability_unavailable";
    action?: string;
    triageItemId?: string;
    draftBody?: string;
    scheduleProposal?: ScheduleProposal;
    scheduleExecution?: { eventId: string; eventLink?: string; emailMessageId?: string };
    calendarAction?: "cancel";
    calendarEvents?: CalendarEventCandidate[];
    selectedCalendarEventId?: string;
    proposedAction?: string;
  };
  error?: { message?: string; action?: string; plugin?: string } | string;
  created_at: string;
}

interface ScheduleProposal {
  kind: "schedule_proposal";
  version: 1;
  event: {
    summary: string;
    start: string;
    end: string;
    timeZone: string;
    durationMinutes: number;
    meetingProvider: "google_meet";
    calendarId: "primary";
    location?: string;
    description?: string;
    recurrence?: "one_off" | "recurring";
    recurrenceRule?: string;
    reminderMinutes?: number;
  };
  invitation: { attendees: string[] };
  alternatives: Array<{ start: string; end: string; timeZone: string }>;
  email?: { to: string[]; subject: string; body: string };
}

interface CalendarEventCandidate {
  id: string;
  calendarId: string;
  topic: string;
  start: string;
  end: string;
  location: string;
  attendees: string[];
  description: string;
}

type MutationState = { runId: string; action: "approve" | "cancel" | "edit" | "select" } | null;
type BriefingState = "loading" | "ready" | "error" | "session_expired";

function actionLabel(run: Run): string {
  if (run.metadata?.scheduleProposal) return "Create meeting and invitation";
  if (run.metadata?.proposedAction === "calendar.delete_event") return "Cancel selected meeting";
  if (run.metadata?.action === "reply") return "Send email reply";
  if (run.metadata?.action === "ignore") return "Archive or dismiss item";
  if (run.metadata?.action === "snooze") return "Snooze item";
  return "Complete this action";
}

function urgencyLabel(urgency: BriefingItem["content"]["urgency"]): string {
  if (urgency === "high") return "High attention";
  if (urgency === "medium") return "Worth a look";
  return "For later";
}

function formatScheduleTime(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CommandConsole({ email }: CommandConsoleProps) {
  const [command, setCommand] = useState("");
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [briefingState, setBriefingState] = useState<BriefingState>("loading");
  const [briefingError, setBriefingError] = useState("The briefing could not be loaded.");
  const hasLoadedBriefing = useRef(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ messages: Message[]; runs: Run[] }>({
    messages: [],
    runs: [],
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const hasLoadedHistory = useRef(false);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [mutation, setMutation] = useState<MutationState>(null);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedCalendarEvents, setSelectedCalendarEvents] = useState<Record<string, string>>({});

  useEffect(() => {
    if (hasLoadedBriefing.current) return;
    hasLoadedBriefing.current = true;

    void loadBriefing();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isBriefingOpen) {
        setIsBriefingOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBriefingOpen]);

  async function loadBriefing() {
    setBriefingState("loading");
    setBriefingError("The briefing could not be loaded.");
    try {
      const response = await fetch("/api/triage?limit=5", { cache: "no-store" });
      if (response.status === 401) {
        setBriefingState("session_expired");
        setSessionExpired(true);
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message || "The briefing could not be loaded.");
      }
      setBriefing((await response.json()) as BriefingResponse);
      setBriefingState("ready");
      setSessionExpired(false);
    } catch (error) {
      setBriefingError(
        error instanceof Error ? error.message : "The briefing could not be loaded.",
      );
      setBriefingState("error");
    }
  }

  useEffect(() => {
    if (!conversationId) return;

    let active = true;
    let polling = true;
    const fetchHistory = async () => {
      if (!polling) return;
      if (!hasLoadedHistory.current) setHistoryLoading(true);
      try {
        const response = await fetch(`/api/conversations/${conversationId}`);
        if (response.status === 401) {
          polling = false;
          setSessionExpired(true);
          setHistoryError("Your session expired. Sign in again to continue.");
          setHistoryLoading(false);
          return;
        }
        if (!response.ok) {
          setHistoryError("Conversation history is temporarily unavailable.");
          setHistoryLoading(false);
          return;
        }
        const data = await response.json();
        if (active) {
          setHistory(data);
          setHistoryError(null);
          setHistoryLoading(false);
          hasLoadedHistory.current = true;
          setSessionExpired(false);
        }
      } catch {
        if (active) {
          setHistoryError("Conversation history is temporarily unavailable.");
          setHistoryLoading(false);
        }
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [conversationId, historyRetryKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim() || isSubmitting) return;

    const currentCommand = command.trim();
    setCommand("");
    setIsSubmitting(true);
    setCommandError(null);
    const optimisticMessageId = `optimistic-${Date.now()}`;

    // Optimistically add user message
    setHistory((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: optimisticMessageId,
          role: "user",
          content: currentCommand,
          created_at: new Date().toISOString(),
        },
      ],
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: currentCommand,
          conversationId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (response.status === 401) {
        setSessionExpired(true);
        throw new Error("Your session expired. Sign in again to continue.");
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string | { message?: string };
        } | null;
        const message =
          typeof payload?.error === "string" ? payload.error : payload?.error?.message;
        throw new Error(message || "The command could not be sent.");
      }
      const data = JSON.parse(await response.text());
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
      }
      setCommandError(null);
      setSessionExpired(false);
    } catch (error) {
      setHistory((prev) => ({
        ...prev,
        messages: prev.messages.filter((message) => message.id !== optimisticMessageId),
      }));
      setCommand(currentCommand);
      setCommandError(error instanceof Error ? error.message : "The command could not be sent.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(runId: string) {
    if (sessionExpired) return;
    setActionError(null);
    setMutation({ runId, action: "approve" });
    try {
      const response = await fetch(`/api/runs/${runId}/approve`, { method: "POST" });
      if (!response.ok) throw new Error("This approval is no longer available.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The action could not be approved.");
    } finally {
      setMutation(null);
    }
  }

  async function handleCancel(runId: string) {
    if (sessionExpired) return;
    setActionError(null);
    setMutation({ runId, action: "cancel" });
    try {
      const response = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("This approval is no longer available.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The action could not be cancelled.");
    } finally {
      setMutation(null);
    }
  }

  async function handleCalendarEventSelection(runId: string, eventId: string) {
    if (sessionExpired || !eventId) return;
    setActionError(null);
    setMutation({ runId, action: "select" });
    try {
      const response = await fetch(`/api/runs/${runId}/select-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!response.ok) throw new Error("The meeting selection is no longer available.");
      setHistoryRetryKey((value) => value + 1);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The meeting could not be selected for cancellation.",
      );
    } finally {
      setMutation(null);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>, run: Run) {
    event.preventDefault();
    if (sessionExpired || !conversationId || !run.metadata?.triageItemId || !draftBody.trim())
      return;
    setActionError(null);
    setMutation({ runId: run.id, action: "edit" });
    try {
      const response = await fetch(`/api/triage/actions/${run.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draftBody }),
      });
      if (!response.ok) throw new Error("The reply proposal could not be updated.");
      setEditingRunId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The reply could not be updated.");
    } finally {
      setMutation(null);
    }
  }

  // Combine messages and runs by created_at for rendering (simplified)
  const conversationItems = [...history.messages, ...history.runs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const hasUnavailableSource = Boolean(
    briefing?.sourceStatus &&
    Object.values(briefing.sourceStatus).some((status) => status.state === "unavailable"),
  );

  return (
    <main className="console-shell">
      {sessionExpired && (
        <div className="session-banner" role="alert">
          <span>Your session expired. Sign in again to reconnect Relay.</span>
          <a href="/login">Sign in</a>
        </div>
      )}

      {/* Tab to open briefing */}
      <button 
        className="briefing-tab" 
        onClick={() => setIsBriefingOpen(true)}
        aria-label="Open daily briefing"
        aria-expanded={isBriefingOpen}
      >
        Daily Brief
      </button>

      <section className={`briefing-drawer ${isBriefingOpen ? "open" : ""}`} aria-labelledby="briefing-title">
        <button 
          className="briefing-close-btn" 
          onClick={() => setIsBriefingOpen(false)}
          aria-label="Close daily briefing"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div className="briefing-drawer-scroll-area">
          <div className="eyebrow">Daily briefing</div>
          <h1 id="briefing-title">A clearer place to start</h1>
        <p className="panel-intro">
          A short list of the email and calendar items most worth your attention.
        </p>

          {briefingState === "loading" && (
            <div
              className="briefing-status briefing-status-loading"
              role="status"
              aria-live="polite"
            >
              Gathering your latest context…
            </div>
          )}
          {briefingState === "session_expired" && (
            <div className="briefing-status briefing-status-error" role="alert">
              Your session expired before the briefing could load.{" "}
              <a href="/login">Sign in again</a>.
            </div>
          )}
          {briefingState === "error" && (
            <div className="briefing-status briefing-status-error" role="status">
              {briefingError} You can still use the command console below.
              <button
                type="button"
                className="inline-retry-btn"
                onClick={() => void loadBriefing()}
              >
                Retry briefing
              </button>
            </div>
          )}
          {briefingState === "ready" && briefing?.items.length === 0 && !hasUnavailableSource && (
            <div className="empty-briefing" aria-live="polite">
              <div className="empty-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Nothing urgent right now</h2>
              <p>Ask Relay to review your inbox, check your calendar, or find a time to meet.</p>
            </div>
          )}
          {briefingState === "ready" && Boolean(briefing?.items.length) && (
            <div className="briefing-items" aria-live="polite">
              {briefing?.items.map((item) => (
                <article className="briefing-item" key={item.id}>
                  <div
                    className={`urgency-mark urgency-${item.content.urgency}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="briefing-item-meta">
                      <span>{item.source === "email" ? "Email" : "Calendar"}</span>
                      <span>{urgencyLabel(item.content.urgency)}</span>
                    </div>
                    <h2>{item.content.summary}</h2>
                    <p>{item.content.reason}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
          {briefingState === "ready" && briefing?.sourceStatus && (
            <div className="source-status-list" aria-live="polite">
              {Object.entries(briefing.sourceStatus).map(([source, status]) =>
                status.state === "unavailable" ? (
                  <div className="source-status source-status-error" key={source}>
                    <span>
                      {source === "email" ? "Email" : "Calendar"} is unavailable.
                      {status.error?.message ? ` ${status.error.message}` : ""}
                    </span>
                    {status.error?.retryable && (
                      <button
                        type="button"
                        className="inline-retry-btn"
                        onClick={() => void loadBriefing()}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
        </section>

        <aside className="context-panel centered-context" aria-labelledby="context-title">
          <div className="eyebrow">Workspace</div>
          <h2 id="context-title">A single place to think clearly.</h2>

          {conversationItems.length > 0 ? (
            <div className="conversation-history">
              {historyLoading && <div className="history-status">Loading conversation…</div>}
              {historyError && (
                <div className="history-status" role="alert">
                  {historyError}
                  {sessionExpired ? (
                    <a href="/login">Sign in again</a>
                  ) : (
                    <button
                      type="button"
                      className="inline-retry-btn"
                      onClick={() => {
                        hasLoadedHistory.current = false;
                        setHistoryRetryKey((value) => value + 1);
                      }}
                    >
                      Retry history
                    </button>
                  )}
                </div>
              )}
              {conversationItems.map((item) => {
                if ("role" in item) {
                  return (
                    <div
                      key={item.id}
                      className={`message-bubble message-${item.role} markdown-body`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  );
                } else {
                  return (
                    <div key={item.id} className="run-card">
                      <div className={`run-status run-status-${item.status}`}>
                        <span className="status-indicator" aria-hidden="true"></span>
                        Agent is {item.status.replace(/_/g, " ")}
                      </div>

                      {item.metadata?.progressEvents && item.metadata.progressEvents.length > 0 && (
                        <ul className="progress-list">
                          {(item.metadata?.progressEvents ?? []).map((event, index) => {
                            const isLast =
                              index === (item.metadata?.progressEvents?.length ?? 0) - 1;
                            const isRunFinished =
                              item.status === "completed" || item.status === "failed";

                            let stepClass = "step-completed";
                            let icon = (
                              <svg
                                className="icon-completed"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            );

                            if (event.status === "failed") {
                              stepClass = "step-failed";
                              icon = (
                                <svg
                                  className="icon-failed"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                              );
                            } else if (isLast && !isRunFinished) {
                              stepClass = "step-executing";
                              icon = <div className="spinner" />;
                            }

                            return (
                              <li key={index} className={`progress-step ${stepClass}`}>
                                <div className="progress-step-icon">{icon}</div>
                                <span>{event.message}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {item.metadata?.finalSummary && (
                        <div className="run-summary markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.metadata.finalSummary}
                          </ReactMarkdown>
                        </div>
                      )}
                      {item.status === "completed" &&
                        item.metadata?.calendarAction === "cancel" &&
                        Boolean(item.metadata.calendarEvents?.length) &&
                        (() => {
                          const events = item.metadata?.calendarEvents ?? [];
                          const selectedEventId = selectedCalendarEvents[item.id] ?? events[0].id;
                          const selectedEvent =
                            events.find((event) => event.id === selectedEventId) ?? events[0];
                          return (
                            <div className="approval-section calendar-cancellation-selector">
                              <div className="approval-heading">
                                <span className="approval-kicker">Choose a meeting</span>
                                <strong>Prepare cancellation</strong>
                              </div>
                              <label htmlFor={`calendar-event-${item.id}`}>Upcoming meeting</label>
                              <select
                                id={`calendar-event-${item.id}`}
                                value={selectedEventId}
                                onChange={(event) =>
                                  setSelectedCalendarEvents((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                disabled={mutation !== null || sessionExpired}
                              >
                                {events.map((event) => (
                                  <option key={event.id} value={event.id}>
                                    {event.start} — {event.topic}
                                  </option>
                                ))}
                              </select>
                              <div className="schedule-proposal" aria-live="polite">
                                <dl className="schedule-proposal-details">
                                  <div>
                                    <dt>When</dt>
                                    <dd>
                                      {selectedEvent.start} — {selectedEvent.end}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Where</dt>
                                    <dd>{selectedEvent.location}</dd>
                                  </div>
                                  <div>
                                    <dt>Invited</dt>
                                    <dd>
                                      {selectedEvent.attendees.join(", ") || "No invitees listed"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Description</dt>
                                    <dd>{selectedEvent.description}</dd>
                                  </div>
                                </dl>
                              </div>
                              <div className="approval-actions">
                                <button
                                  type="button"
                                  className="approve-btn"
                                  onClick={() =>
                                    void handleCalendarEventSelection(item.id, selectedEventId)
                                  }
                                  disabled={mutation !== null || sessionExpired}
                                >
                                  {mutation?.runId === item.id && mutation.action === "select"
                                    ? "Preparing…"
                                    : "Prepare cancellation"}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      {item.error && (
                        <div className="run-error">
                          <div>
                            {typeof item.error === "string" ? item.error : item.error.message}
                          </div>
                          {typeof item.error !== "string" &&
                            item.error.action === "connect_integration" &&
                            item.error.plugin && (
                              <div className="mt-2">
                                <a
                                  href={`/api/connect?plugin=${item.error.plugin}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="connect-btn"
                                >
                                  Connect {item.error.plugin}
                                </a>
                              </div>
                            )}
                        </div>
                      )}

                      {item.status === "waiting_for_approval" && (
                        <div className="approval-section">
                          <div className="approval-heading">
                            <span className="approval-kicker">Approval required</span>
                            <strong>{actionLabel(item)}</strong>
                          </div>
                          <p>Review this action before Relay makes any consequential change.</p>
                          {item.metadata?.scheduleProposal && (
                            <div className="schedule-proposal" aria-label="Meeting proposal">
                              <div className="schedule-proposal-title">
                                {item.metadata.scheduleProposal.event.summary}
                              </div>
                              <dl className="schedule-proposal-details">
                                <div>
                                  <dt>Selected time</dt>
                                  <dd>
                                    {formatScheduleTime(
                                      item.metadata.scheduleProposal.event.start,
                                      item.metadata.scheduleProposal.event.timeZone,
                                    )}
                                    {" – "}
                                    {formatScheduleTime(
                                      item.metadata.scheduleProposal.event.end,
                                      item.metadata.scheduleProposal.event.timeZone,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Duration</dt>
                                  <dd>
                                    {item.metadata.scheduleProposal.event.durationMinutes} minutes
                                  </dd>
                                </div>
                                <div>
                                  <dt>Meeting</dt>
                                  <dd>Google Meet · Primary calendar</dd>
                                </div>
                                {item.metadata.scheduleProposal.event.location && (
                                  <div>
                                    <dt>Location</dt>
                                    <dd>{item.metadata.scheduleProposal.event.location}</dd>
                                  </div>
                                )}
                                {item.metadata.scheduleProposal.event.description && (
                                  <div>
                                    <dt>Agenda</dt>
                                    <dd>{item.metadata.scheduleProposal.event.description}</dd>
                                  </div>
                                )}
                                {item.metadata.scheduleProposal.event.recurrence && (
                                  <div>
                                    <dt>Recurrence</dt>
                                    <dd>
                                      {item.metadata.scheduleProposal.event.recurrence === "one_off"
                                        ? "One-off"
                                        : "Recurring"}
                                    </dd>
                                  </div>
                                )}
                                {item.metadata.scheduleProposal.event.reminderMinutes !==
                                  undefined && (
                                  <div>
                                    <dt>Reminder</dt>
                                    <dd>
                                      {item.metadata.scheduleProposal.event.reminderMinutes} minutes
                                      before
                                    </dd>
                                  </div>
                                )}
                                <div>
                                  <dt>Inviting</dt>
                                  <dd>
                                    {item.metadata.scheduleProposal.invitation.attendees.join(", ")}
                                  </dd>
                                </div>
                              </dl>
                              {item.metadata.scheduleProposal.alternatives.length > 0 && (
                                <div className="schedule-alternatives">
                                  <span>Other verified options</span>
                                  <ul>
                                    {item.metadata.scheduleProposal.alternatives.map(
                                      (alternative) => (
                                        <li key={alternative.start}>
                                          {formatScheduleTime(
                                            alternative.start,
                                            alternative.timeZone,
                                          )}
                                          {" – "}
                                          {formatScheduleTime(
                                            alternative.end,
                                            alternative.timeZone,
                                          )}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                              {item.metadata.scheduleProposal.email && (
                                <div className="schedule-email-preview">
                                  <strong>Additional email</strong>
                                  <span>
                                    To: {item.metadata.scheduleProposal.email.to.join(", ")}
                                  </span>
                                  <span>
                                    Subject: {item.metadata.scheduleProposal.email.subject}
                                  </span>
                                  <p>{item.metadata.scheduleProposal.email.body}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {item.metadata?.action === "reply" &&
                            item.metadata.draftBody &&
                            (editingRunId === item.id ? (
                              <form
                                onSubmit={(event) => handleEditSubmit(event, item)}
                                className="reply-editor"
                              >
                                <label htmlFor={`reply-${item.id}`}>Reply body</label>
                                <textarea
                                  id={`reply-${item.id}`}
                                  value={draftBody}
                                  onChange={(event) => setDraftBody(event.target.value)}
                                  maxLength={5000}
                                  rows={6}
                                />
                                <div className="approval-actions">
                                  <button
                                    type="submit"
                                    className="approve-btn"
                                    disabled={mutation !== null || sessionExpired}
                                  >
                                    {mutation?.runId === item.id && mutation.action === "edit"
                                      ? "Saving…"
                                      : "Save reply"}
                                  </button>
                                  <button
                                    type="button"
                                    className="cancel-btn"
                                    onClick={() => setEditingRunId(null)}
                                    disabled={mutation !== null || sessionExpired}
                                  >
                                    Keep current
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div className="reply-preview">{item.metadata.draftBody}</div>
                            ))}
                          {actionError && mutation?.runId === item.id && (
                            <div className="action-error" role="alert">
                              {actionError}
                            </div>
                          )}
                          <div className="approval-actions">
                            {item.metadata?.action === "reply" &&
                              item.metadata.draftBody &&
                              editingRunId !== item.id && (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => {
                                    setDraftBody(item.metadata?.draftBody ?? "");
                                    setEditingRunId(item.id);
                                  }}
                                  disabled={mutation !== null || sessionExpired}
                                >
                                  Edit reply
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={() => handleCancel(item.id)}
                              className="cancel-btn"
                              disabled={mutation !== null || sessionExpired}
                            >
                              {mutation?.runId === item.id && mutation.action === "cancel"
                                ? "Cancelling…"
                                : "Cancel"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApprove(item.id)}
                              className="approve-btn"
                              disabled={
                                mutation !== null || editingRunId === item.id || sessionExpired
                              }
                            >
                              {mutation?.runId === item.id && mutation.action === "approve"
                                ? "Approving…"
                                : "Approve"}
                            </button>
                          </div>
                        </div>
                      )}

                      {item.status === "cancelled" && (
                        <div className="run-notice">
                          This action was cancelled before execution.
                        </div>
                      )}
                      {item.status === "completed" &&
                        item.metadata?.outcome === "no_availability" && (
                          <div className="run-notice">
                            No meeting was created because no verified availability matched the
                            requested constraints. Try another time or duration.
                          </div>
                        )}
                      {item.status === "completed" &&
                        item.metadata?.outcome === "availability_unavailable" && (
                          <div className="run-notice">
                            Calendar availability could not be verified for one or more attendees.
                            Ask the attendee to share availability or retry with another verified
                            attendee.
                          </div>
                        )}
                      {item.status === "completed" &&
                        item.metadata?.outcome !== "no_availability" &&
                        item.metadata?.outcome !== "availability_unavailable" &&
                        item.metadata?.calendarAction !== "cancel" && (
                          <div className="run-notice run-notice-success">
                            Action completed successfully.
                            {item.metadata?.scheduleExecution?.eventLink && (
                              <a
                                href={item.metadata.scheduleExecution.eventLink}
                                target="_blank"
                                rel="noreferrer"
                                className="run-link"
                              >
                                Open calendar event
                              </a>
                            )}
                          </div>
                        )}
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            <>
              {historyLoading && <div className="history-status">Loading conversation…</div>}
              {historyError && (
                <div className="history-status" role="alert">
                  {historyError}
                  {sessionExpired && <a href="/login">Sign in again</a>}
                </div>
              )}
              <div className="context-list">
                <div className="context-item">
                  <span className="context-icon" aria-hidden="true">
                    ✦
                  </span>
                  <span>
                    <strong>Priority first</strong>
                    <small>Important context, without the noise.</small>
                  </span>
                </div>
                <div className="context-item">
                  <span className="context-icon" aria-hidden="true">
                    ↗
                  </span>
                  <span>
                    <strong>Actions stay yours</strong>
                    <small>Relay asks before anything consequential.</small>
                  </span>
                </div>
              </div>
            </>
          )}
      </aside>

      <FloatingComposer
        command={command}
        setCommand={setCommand}
        handleSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        sessionExpired={sessionExpired}
        commandError={commandError}
      />
    </main>
  );
}
