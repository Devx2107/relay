# Current Task

## Task

FND-002 — Configure Supabase project foundation and environment validation.

## Goal

Prepare the server-side Supabase foundation required for Google authentication and user-owned Flow data.

## Context

The bootstrap is complete. The Flow specification requires Supabase Auth, Google OAuth, Supabase PostgreSQL, simple user-scoped entities, and no service-role credentials in browser code. This task is the first post-bootstrap task in the dependency order.

## Requirements

- Inspect the repository and choose the minimal supported Supabase server/browser client split.
- Define the initial migration boundary without adding unnecessary product tables.
- Validate required environment variables without requiring real credentials during build.
- Keep secrets server-only and document local setup.
- Do not implement Google OAuth until this foundation is reviewed and complete.

## Acceptance Criteria

- Supabase URL and public anon key are represented in `.env.example` and validated at the correct runtime boundary.
- Server-only secrets, if needed, are clearly separated from browser-safe variables.
- A documented migration approach exists for `users`, `conversations`, `messages`, `triage_items`, and `agent_runs`.
- Build and tests work without live Supabase credentials.
- No Corsair, Gmail, Calendar, Groq, triage, scheduling, or autonomous write behavior is implemented in this task.

## Relevant Files

- `package.json`
- `.env.example`
- `docs/SETUP.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `supabase/`
- `lib/`

## Constraints

- Follow least privilege and never expose a service-role key to browser code.
- Keep the schema and client abstraction minimal.
- Do not invent Supabase SDK behavior; verify it against the selected SDK documentation.

## Plan

1. Inspect current dependencies and confirm the Supabase SDK/client approach.
2. Add environment validation and the minimal server/browser client boundary.
3. Add the initial migration structure and security notes.
4. Add focused tests for configuration behavior.
5. Run formatting, lint, typecheck, tests, and build; update documentation.

## Verification

- [ ] Formatting
- [ ] Lint
- [ ] Typecheck
- [ ] Tests
- [ ] Build

## Review

- [ ] No unrelated changes
- [ ] No regressions
- [ ] No unnecessary complexity
- [ ] Security reviewed
- [ ] Documentation updated

## Status

READY
