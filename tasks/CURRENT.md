# Current Task

## Current Task: QLT-005 security and write-approval review

## Goal

Review secrets handling, OAuth scopes, authorization, prompt safety, and server-enforced write approval as required by QLT-005.

## Context

QLT-005 is the final P0 verification item. The review must cover both API authorization and the agent’s write boundary, while preserving the integration abstraction and approval requirement.

## Requirements

- Review secrets and OAuth scope handling.
- Review user ownership checks and server-side approval enforcement.
- Review prompt/tool boundaries for unsafe or unapproved writes.
- Add focused regression coverage or minimal fixes for confirmed findings.
- Do not modify later backlog items.

## Acceptance Criteria

- Secrets are not exposed to browser code or committed files.
- Protected routes enforce authentication and user ownership.
- Write tools cannot execute without a server-approved run.
- Prompt/tool handling fails safely for unsupported or malformed requests.
- No unrelated product behavior changes are included.

## Relevant Areas

- `app/api/**`
- `lib/agent/**`
- `lib/auth.ts`
- `supabase/migrations/*rls*`
- `tests/*security*`, `tests/service.test.ts`, `tests/rls.test.ts`

## Constraints

- Do not add credentials or alter environment files with secrets.
- Keep Corsair behind the server integration boundary.
- Do not modify later backlog items.

## Plan

1. Inspect security-sensitive routes, agent services, tools, prompts, and RLS policies.
2. Run focused security and authorization checks.
3. Fix only confirmed QLT-005 findings and add regression coverage where useful.
4. Run verification and record QLT-005 completion only.

## Verification

- [x] Formatting (targeted QLT-005 files)
- [x] Lint
- [x] Typecheck
- [x] Tests (111 passed; 3 RLS tests skipped without configured database)
- [x] Build (credential-free `next build` passed)
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

DONE - QLT-005 security and write-approval review complete.
