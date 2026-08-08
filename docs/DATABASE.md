# Database

Corsair uses the server-side `DATABASE_URL` connection string to persist its own integration state. Configure it with the Supabase IPv4 session pooler URL; do not put it in a `NEXT_PUBLIC_*` variable or browser bundle. Apply `supabase/migrations/20260808000000_corsair_foundation.sql` to the Supabase project before live OAuth connections are used. The migration enables RLS with no client-facing policies; Corsair accesses these tables through the server-side pool.

The initial conceptual entities are `users`, `conversations`, `messages`, `triage_items`, and `agent_runs`; pending actions may be added when approval implementation begins. Keep the schema minimal and use migrations.

User-owned records require Row Level Security or equivalent server authorization. Never expose Supabase service-role credentials to the browser. The final schema must document relationships, indexes, retention, and policies before production use.
