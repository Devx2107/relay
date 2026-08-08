# Agent Design

Triage and scheduling share one agent loop. The model parses language into validated structured data; deterministic code handles simple operations and policy checks.

Read tools include email search/read, contact lookup, calendar read, and availability. Write tools include send email and create/modify event. Every write becomes a pending proposed action, requires explicit user approval, is revalidated by the server, and is verified after execution.

Expose concise status events (for example, “Checked calendar” or “Waiting for approval”), never chain-of-thought. Bound prompts and email content to control free-model quota, and degrade gracefully when Groq or an integration fails.
