# Database

Corsair uses the server-side `DATABASE_URL` connection string to persist its own integration state. Configure it with the Supabase IPv4 session pooler URL; do not put it in a `NEXT_PUBLIC_*` variable or browser bundle. Apply `supabase/migrations/20260808000000_corsair_foundation.sql` to the Supabase project before live OAuth connections are used. The migration enables RLS with no client-facing policies; Corsair accesses these tables through the server-side pool.

The core application schema is defined in `supabase/migrations/20260808000001_app_schema.sql` and includes the following entities:

- **`users`**: Represents application users, keyed by `auth.users(id)`.
- **`conversations`**: Represents a chat thread belonging to a user. Keyed by a random UUID.
- **`messages`**: Represents individual messages within a conversation. Includes `role`, `content`, and `metadata` for tool usage.
- **`triage_items`**: Represents items requiring user attention (e.g., from Gmail or Calendar). Unique by `(user_id, source, source_id)`.
- **`agent_runs`**: Tracks autonomous LLM executions tied to a conversation.

Pending actions may be added to the schema when approval implementation begins. 

## Security and Policies

User-owned records require Row Level Security or equivalent server authorization. Never expose Supabase service-role credentials to the browser.
All application tables (`users`, `conversations`, `messages`, `triage_items`, `agent_runs`) have Row Level Security enabled.
Client-facing policies for these tables will be implemented in FND-005.

## Relationships and Indexes

- `users(id)` references `auth.users(id)` (cascade delete).
- `conversations(user_id)` references `users(id)` (cascade delete).
- `messages(conversation_id)` references `conversations(id)` (cascade delete).
- `triage_items(user_id)` references `users(id)` (cascade delete).
- `agent_runs(conversation_id)` references `conversations(id)` (cascade delete).

*Note: Further indexing (e.g., on foreign keys to optimize joins) and retention policies should be added prior to production.*
