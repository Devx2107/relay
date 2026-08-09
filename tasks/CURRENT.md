# Current Task

## Current Task: Test audit and approval-edge bug fixes

## Goal

Make the test suite truthful and strengthen coverage around scheduling approval, execution, verification, and partial failures.

## Context

The non-live suite passes, but `tests/rls.test.ts` currently runs whenever `DATABASE_URL` exists, including placeholder values used for local verification. That makes `npm test` fail with a DNS error instead of clearly skipping an integration-only suite. SCH-005/SCH-006 also need explicit regression coverage for stale, malformed, and duplicate approval paths.

## Requirements

- Make live RLS tests opt-in and skip cleanly during normal local/CI unit runs.
- Preserve a clear command for intentionally running RLS tests against a configured database.
- Add focused approval edge-case tests without changing product scope.
- Do not weaken application authorization or approval enforcement to make tests pass.

## Acceptance Criteria

- `npm test` passes without requiring a live database when `RUN_RLS_TESTS` is not explicitly enabled.
- RLS tests still run when explicitly opted in with valid database configuration.
- Scheduling tests cover expired, malformed, duplicate/claimed, event-verification, and partial-email failure behavior.
- Lint, typecheck, formatting, non-live tests, and build pass.
- No unrelated product behavior changes are included.

## Relevant Areas

- `tests/rls.test.ts`
- `tests/service.test.ts`
- `tests/scheduling-execution.test.ts`
- `lib/agent/service.ts`
- `tasks/BACKLOG.md`
- `docs/DEVELOPMENT.md`

## Constraints

- Live RLS coverage must remain available and must not be silently converted into unit tests.
- Keep provider calls mocked in normal tests.
- Preserve the server-side approval boundary.

## Plan

1. Inspect the failing RLS harness and approval edge paths.
2. Add explicit RLS opt-in and documentation.
3. Add or fix focused regression tests for scheduling approvals.
4. Run the full non-live suite, opt-in-independent checks, lint, typecheck, and build.

## Verification

- [x] Formatting (targeted task files)
- [x] Lint
- [x] Typecheck
- [x] Tests (99 passed, 3 live RLS tests skipped without opt-in)
- [x] Build
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

REVIEW - Test audit and approval-edge fixes are complete and awaiting review.
