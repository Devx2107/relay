"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

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

export default function CommandConsole({ email }: CommandConsoleProps) {
  const [command, setCommand] = useState("");
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [briefingError, setBriefingError] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const hasLoadedBriefing = useRef(false);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

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
          />
          <div className="composer-footer">
            <span className="composer-note">Relay reads first. You stay in control.</span>
            <button type="submit" aria-label="Send command" disabled={!command.trim()}>
              <span aria-hidden="true">↑</span>
              Send
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
