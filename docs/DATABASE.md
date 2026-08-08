# Database

The initial conceptual entities are `users`, `conversations`, `messages`, `triage_items`, and `agent_runs`; pending actions may be added when approval implementation begins. Keep the schema minimal and use migrations.

User-owned records require Row Level Security or equivalent server authorization. Never expose Supabase service-role credentials to the browser. The final schema must document relationships, indexes, retention, and policies before production use.
