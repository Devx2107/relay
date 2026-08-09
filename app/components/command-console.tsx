"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  sourceStatus?: Record<string, { state: "available" | "unavailable" }>;
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
  metadata?: any;
  error?: any;
  created_at: string;
}

export default function CommandConsole({ email }: CommandConsoleProps) {
  const [command, setCommand] = useState("");
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [briefingError, setBriefingError] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const hasLoadedBriefing = useRef(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ messages: Message[]; runs: Run[] }>({
    messages: [],
    runs: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (hasLoadedBriefing.current) return;
    hasLoadedBriefing.current = true;

    let active = true;
    fetch("/api/triage?limit=5", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Briefing unavailable");
        return (await response.json()) as BriefingResponse;
      })
      .then((result) => {
        if (active) setBriefing(result);
      })
      .catch(() => {
        if (active) setBriefingError(true);
      })
      .finally(() => {
        if (active) setBriefingLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    let active = true;
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (active) setHistory(data);
      } catch (err) {
        console.error("Failed to fetch conversation history", err);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [conversationId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim() || isSubmitting) return;

    const currentCommand = command.trim();
    setCommand("");
    setIsSubmitting(true);

    // Optimistically add user message
    setHistory((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          id: Date.now().toString(),
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
        body: JSON.stringify({ command: currentCommand, conversationId }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        throw new Error(`Failed to send command: ${errorText}`);
      }
      const data = JSON.parse(await response.text());
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(runId: string) {
    try {
      const response = await fetch(`/api/runs/${runId}/approve`, { method: "POST" });
      if (!response.ok) {
        console.error("Failed to approve run");
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Combine messages and runs by created_at for rendering (simplified)
  const conversationItems = [...history.messages, ...history.runs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <main className="console-shell">
      <header className="console-header">
        <div className="brand-lockup" aria-label="Relay home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>
            <strong>Relay</strong>
            <small>One calm command center</small>
          </span>
        </div>
        <div className="account-pill" title={email || "Authenticated account"}>
          <span className="status-dot" aria-hidden="true" />
          <span className="account-email">{email || "Connected account"}</span>
        </div>
      </header>

      <div className="console-grid">
        <section className="briefing-panel" aria-labelledby="briefing-title">
          <div className="eyebrow">Today&apos;s briefing</div>
          <h1 id="briefing-title">What needs your attention?</h1>
          <p className="panel-intro">
            Your prioritized email and calendar context will appear here as Relay connects the
            pieces.
          </p>

          {briefingLoading && <div className="briefing-status">Gathering your latest context…</div>}
          {briefingError && (
            <div className="briefing-status briefing-status-error" role="status">
              Your briefing could not be loaded. You can still use the command console below.
            </div>
          )}
          {!briefingLoading && !briefingError && briefing?.items.length === 0 && (
            <div className="empty-briefing" aria-live="polite">
              <div className="empty-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Your briefing is ready to begin</h2>
              <p>Ask Relay to triage your inbox, check your calendar, or find a time to meet.</p>
            </div>
          )}
          {!briefingLoading && !briefingError && Boolean(briefing?.items.length) && (
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
                      <span>{item.content.urgency} priority</span>
                    </div>
                    <h2>{item.content.summary}</h2>
                    <p>{item.content.reason}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="context-panel" aria-labelledby="context-title">
          <div className="eyebrow">Workspace</div>
          <h2 id="context-title">A single place to think clearly.</h2>

          {conversationItems.length > 0 ? (
            <div className="conversation-history">
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
                      <div className="run-status">
                        <span className="status-indicator" aria-hidden="true"></span>
                        Agent is {item.status.replace(/_/g, " ")}
                      </div>

                      {item.metadata?.progressEvents && item.metadata.progressEvents.length > 0 && (
                        <ul className="progress-list">
                          {item.metadata.progressEvents.map((event: any, index: number) => {
                            const isLast = index === item.metadata.progressEvents.length - 1;
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
                          <p>This action requires your explicit approval to continue.</p>
                          <button onClick={() => handleApprove(item.id)} className="approve-btn">
                            Approve Action
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          ) : (
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
          )}
        </aside>
      </div>

      <section className="composer-panel" aria-labelledby="composer-title">
        <div className="composer-heading">
          <div>
            <div className="eyebrow">Command console</div>
            <h2 id="composer-title">What should we work on?</h2>
          </div>
          <span className="shortcut-hint">Enter to send</span>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="command-input">
            Enter a command for Relay
          </label>
          <textarea
            id="command-input"
            name="command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Try “triage my inbox” or “find time for a team sync”"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
          />
          <div className="composer-footer">
            <span className="composer-note">Relay reads first. You stay in control.</span>
            <button
              type="submit"
              aria-label="Send command"
              disabled={!command.trim() || isSubmitting}
            >
              <span aria-hidden="true">↑</span>
              Send
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
