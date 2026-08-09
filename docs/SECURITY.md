# Security

Keep `.env`, OAuth secrets, API keys, access tokens, and service-role keys out of Git. Use least privilege and server-only credentials. Validate all model output with schemas and authorization checks.

The backend—not only the UI—must enforce that consequential writes have a persisted proposal and explicit approval. Revalidate stale proposals before execution, verify results, handle expired sessions safely, and show users understandable errors without stack traces. Pending proposals may be cancelled only through an authenticated, server-side state transition; hiding a proposal in the browser is not cancellation.

UI read failures are mapped to bounded states. A `401` stops polling and requires sign-in; it is not automatically retried. Retry controls may repeat idempotent reads, but never consequential writes or approvals. Provider details, tokens, stack traces, and raw response bodies must not be rendered in the browser.

Scheduling options supplied by the browser, including timezone, are validated server-side before entering the agent intent. Invalid values are rejected, not silently replaced. Defaults are configuration only and never constitute approval or trigger a Calendar/Gmail operation.

Calendar availability is fail-closed: malformed or incomplete busy data cannot become an “everyone is free” result. Raw busy intervals and provider payloads stay behind the server integration boundary; slot results are read-only suggestions and do not reserve time or bypass approval.

## Row Level Security (RLS)

All user-owned data in Relay (`users`, `conversations`, `messages`, `triage_items`, and `agent_runs`) is protected by Row Level Security policies at the database level.

- Access is restricted exclusively to the authenticated user based on the `auth.uid()` claim provided by Supabase Auth.
- Users can only perform `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations on data directly owned by them or linked to their conversations.
- Service-role credentials bypass these policies and must therefore never be exposed to the browser.
- The `rls.test.ts` suite validates these boundaries to prevent unauthorized data access across tenants.
  Scheduling proposals contain only validated meeting fields, canonical attendee addresses, and safe ranked slots. Raw Calendar busy intervals, provider responses, credentials, and model reasoning are excluded. Optional email content is bounded and represented for review only; SCH-004 performs no external write.

SCH-005/006 revalidate the stored proposal at approval time, claim the run with a pending-state condition, and execute Calendar before optional email. A run is complete only after provider IDs verify the event and any email; partial event creation is recorded as failed execution rather than hidden or reported as success.
