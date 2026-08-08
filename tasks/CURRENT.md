# Current Task

## Task

INT-001/FND-002 — Audit and establish the server-side Corsair boundary on Supabase Postgres.

## Goal

Scan the repository for integration, configuration, security, and task-state errors; establish the server-side Corsair boundary on Supabase Postgres; and leave the remaining authentication blocker explicit.

## Context

Supabase is provisioned and its IPv4 session-pooler connection string is available locally. Corsair is mounted at `/api/corsair` with Gmail and Google Calendar plugins. The repository scan also found stale task/docs state, generated-output lint failures, and no Supabase session authorization on the route.

## Requirements

- Use `DATABASE_URL` for the server-side Supabase session pooler; do not expose it to browser code.
- Validate Corsair and database configuration at the server boundary without requiring live credentials during build or tests.
- Keep Corsair behind the existing Next.js route boundary.
- Document the required local environment and the Corsair/Supabase database setup boundary.
- Do not present the unauthenticated route as production-ready; track session and tenant authorization as the next blocker.
- Do not implement Google OAuth, Gmail/Calendar workflows, or product actions in this task.

## Acceptance Criteria

- `DATABASE_URL`, `CORSAIR_KEK`, `CORSAIR_DEV_API_KEY`, and `CORSAIR_DEV_SIGNING_SECRET` are represented in `.env.example` and validated server-side.
- The Supabase session-pooler URL, Corsair KEK, and Hub credentials are never imported by browser code.
- The Corsair route remains the only application entry point for Corsair requests.
- The required Corsair database setup boundary is documented.
- Build and tests work without live Supabase credentials.
- Generated `.next` output and TypeScript build metadata are excluded from lint/version control.
- Remaining production risk is documented: the route has no Supabase session or tenant authorization yet.
- No Gmail/Calendar workflows, Google OAuth, Groq, triage, scheduling, or autonomous write behavior is implemented in this task.

## Relevant Files

- `package.json`
- `.env.example`
- `corsair.ts`
- `app/api/corsair/[[...path]]/route.ts`
- `lib/`
- `docs/SETUP.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `eslint.config.mjs`
- `.gitignore`
- `README.md`
- `tasks/BACKLOG.md`

## Constraints

- Follow least privilege and never expose a service-role key to browser code.
- Keep the schema and client abstraction minimal.
- Do not invent Corsair SDK behavior; use the installed package contract.
- Do not add a Supabase client SDK until authentication/session work requires it.

## Plan

1. Inspect the existing Corsair route, pool, and installed SDK contract.
2. Add server-only environment validation and use it in the pool/Corsair configuration.
3. Document Supabase session-pooler and Corsair setup boundaries.
4. Correct stale repository task/docs state and generated-output lint configuration.
5. Add focused tests for configuration behavior without live credentials.
6. Run formatting, lint, typecheck, tests, and build; review security and scope.

## Verification

- [x] Changed files formatted with Prettier (`.env.example` is intentionally excluded because it has no parser).
- [x] Targeted lint
- [x] Full lint after excluding generated output
- [x] Typecheck
- [x] Tests (3 passed)
- [x] Build
- [ ] Repository-wide formatting: existing baseline reports 35 unrelated files; no unrelated files were reformatted.

## Review

- [x] Task changes are scoped; pre-existing workspace changes were preserved.
- [x] No regressions found in targeted checks
- [x] No unnecessary complexity
- [x] Security reviewed: credentials and database URL remain server-only; Corsair creation is lazy; unauthenticated route risk is documented.
- [x] Documentation updated

## Scan Findings / Open Errors

- The migration file exists, but its application to the configured Supabase project was not verified from this workspace.
- `/api/corsair` has no Supabase session or tenant authorization yet. Keep it development-only until FND-003 and FND-005 provide protected session handling and authorization policies.
- `next@16.3.0` and `eslint-config-next@15.5.23` are installed at different major versions; align them before depending on framework-specific lint behavior.
- `npm run format` still reports 35 pre-existing unrelated files. Changed files were formatted; the repository was not mass-reformatted.
- `next build` warns that `package-lock.json` is outside the Git repository root used by Turbopack. This is non-blocking but should be resolved in repository/tooling setup.

## Status

REVIEW — Repository scan and Corsair/Supabase foundation are complete for code/config scope. Resolve the findings above, apply and verify the migration, then add Supabase session/tenant authorization before treating `/api/corsair` as production-ready.
