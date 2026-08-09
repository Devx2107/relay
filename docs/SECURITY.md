# Security

Keep `.env`, OAuth secrets, API keys, access tokens, and service-role keys out of Git. Use least privilege and server-only credentials. Validate all model output with schemas and authorization checks.

The backend—not only the UI—must enforce that consequential writes have a persisted proposal and explicit approval. Revalidate stale proposals before execution, verify results, handle expired sessions safely, and show users understandable errors without stack traces.

## Row Level Security (RLS)

All user-owned data in Relay (`users`, `conversations`, `messages`, `triage_items`, and `agent_runs`) is protected by Row Level Security policies at the database level.

- Access is restricted exclusively to the authenticated user based on the `auth.uid()` claim provided by Supabase Auth.
- Users can only perform `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations on data directly owned by them or linked to their conversations.
- Service-role credentials bypass these policies and must therefore never be exposed to the browser.
- The `rls.test.ts` suite validates these boundaries to prevent unauthorized data access across tenants.
