# Integrations

Supabase provides authentication and PostgreSQL. Google OAuth is required for Gmail and Calendar access. Corsair/MCP is the external integration boundary for those capabilities. Groq provides limited/free-model language assistance.

Integration adapters belong under `lib/integrations/` once implementation starts. They must be mockable; normal tests must not require live accounts. Do not add n8n to the initial architecture.
