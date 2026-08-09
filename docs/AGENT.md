# Agent Design

Triage and scheduling share one agent loop. The model parses language into validated structured data; deterministic code handles simple operations and policy checks.

Read tools include email search/read, contact lookup, calendar read, and availability. Write tools include send email and create/modify event. Every write becomes a pending proposed action, requires explicit user approval, is revalidated by the server, and is verified after execution.

Expose concise status events (for example, “Checked calendar” or “Waiting for approval”), never chain-of-thought. Bound prompts and email content to control free-model quota, and degrade gracefully when Groq or an integration fails.

## Contract vocabulary

The server-side contracts in `lib/agent/contracts.ts` define the shared boundary for later agent work:

- `AgentRun` tracks a conversation-owned run through queued, running, approval, completion, failure, or cancellation states.
- `AgentIntent` currently supports only `triage` and `schedule`; provider-specific parsing is deferred to later tasks.
- `AgentToolCall` requires tenant scope and explicit `read` or `write` classification. Write classification is the input to the later approval boundary.
- `AgentToolResult` carries structured data or a mapped failure without requiring callers to parse provider error strings.
- `AgentProgressEvent` exposes concise lifecycle messages, while `UserFacingError` provides bounded actionable errors.

Contract parsers reject unsupported values, oversized user-facing messages, non-serializable metadata, and sensitive metadata keys. They must not contain chain-of-thought, credentials, access tokens, or raw provider secrets.

The deterministic parser in `lib/agent/intents.ts` recognizes triage requests containing inbox/email/unread or calendar/event language and scheduling requests containing schedule, booking, availability, or time-finding language. It extracts only an optional bounded triage limit and deduplicated attendee email addresses. Unsupported or mixed triage-and-scheduling requests return an `invalid_request` error and never produce an executable action.

SCH-001’s deterministic parser extracts bounded, canonical, deduplicated attendee email addresses and marks missing or display-name attendees as unresolved rather than guessing identities. Unsupported, malformed, excessive, or mixed triage-and-scheduling requests return an `invalid_request` error and never produce an executable action. Scheduling parsing performs no provider calls and owns no defaults or writes.

SCH-002 adds a validated, editable scheduling-options object to schedule intents. It applies documented defaults only for absent fields and records whether each value came from the user, a default, or the timezone fallback. Account timezone context is validated at the internal chat boundary before reaching the agent loop; options normalization still performs no provider calls or writes.

SCH-003 keeps availability ranking deterministic after the `calendar.check_availability` read. Raw busy intervals are not forwarded to the model or UI; only bounded verified slots or a safe unavailable result are exposed. The model cannot override interval conflicts or reserve a slot.

## Groq boundary

`lib/agent/groq.ts` is an optional server-only adapter for bounded language tasks. It uses Groq’s OpenAI-compatible chat-completions endpoint, defaults to `openai/gpt-oss-20b`, and accepts `GROQ_API_KEY`/`GROQ_MODEL` from server environment configuration. Prompts are limited by message count and character count, completions are token-bounded, and every missing-key, timeout, provider-error, or malformed-response path returns the caller’s deterministic fallback with a safe `UserFacingError`.

Groq may classify or summarize ambiguous content, but it cannot execute tools, authorize writes, or replace deterministic policy checks.

## Tool registry

`lib/agent/tools.ts` is the server-side allowlist between agent decisions and `IntegrationService`. Callers submit a logical tool ID and operation; the registry supplies the verified plugin/action mapping and rejects unknown tools or operation mismatches. Current Gmail and Calendar reads are executable through the injected integration service with tenant scope preserved. Write tools are classified by the registry, but execution returns `approval_required` until AGT-006 provides persisted server-side approval. Planned tools have no guessed external action path and return an unavailable error.
Scheduling proposal preparation is deterministic and server-side. After the availability read is normalized into verified slots, SCH-004 creates one combined proposal containing event details, invitation recipients, and optional validated email data. Raw busy intervals and provider payloads are not forwarded. The proposal is pending only; event, invitation, and email writes remain behind the approval boundary owned by SCH-005.
