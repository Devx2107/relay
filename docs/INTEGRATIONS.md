# Integrations

Supabase provides authentication and PostgreSQL. Google OAuth is required for Gmail and Calendar access. Corsair/MCP is the external integration boundary for those capabilities. The current server route is `/api/corsair`, backed by `corsair.ts`, `pg`, and the Supabase session-pooler `DATABASE_URL`. The installed Corsair plugins are Gmail and Google Calendar.

The Corsair SDK persists integration, account, entity, event, and permission records. Apply `supabase/migrations/20260808000000_corsair_foundation.sql` before using the route. The route is not production-ready until Supabase session authentication and tenant scoping are added; do not expose it as an unauthenticated public API.

Groq provides limited/free-model language assistance and is not integrated yet.

Integration adapters belong under `lib/integrations/` once implementation starts. They must be mockable; normal tests must not require live accounts. Do not add n8n to the initial architecture.
