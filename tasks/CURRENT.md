# Current Task

## Task

INT-008 — Add integration mocks, expired-session handling, rate-limit handling, and failure mapping.

## Goal

Add failure mapping to the `IntegrationService` boundary to intercept Corsair errors (like missing auth, required permissions, and rate limits) and translate them into a unified format for the agent.

## Context

The agent needs a reliable way to interpret errors from Corsair plugins. By trapping `AuthMissingError`, `PermissionRequiredError`, and `CorsairClientError`, we can set flags (`isAuthMissing`, `isPermissionRequired`, `isRateLimited`) directly on the `ToolResult` interface. This way, the LLM logic later doesn't need to parse string errors.

## Requirements

- Catch `AuthMissingError` and map to `isAuthMissing = true`.
- Catch `PermissionRequiredError` and map to `isPermissionRequired = true`.
- Catch `CorsairClientError` 401 and 429 and map to `isAuthMissing = true` and `isRateLimited = true` respectively.
- Add tests in `tests/integration.test.ts`.

## Acceptance Criteria

- `lib/integration.ts` has error mapping logic.
- `tests/integration.test.ts` has passing tests.

## Relevant Files

- `lib/integration.ts`
- `tests/integration.test.ts`
- `tasks/BACKLOG.md`
- `tasks/CURRENT.md`

## Constraints

- Use the mock service for tests. No live external requests.

## Plan

1. Update `lib/integration.ts`.
2. Update `tests/integration.test.ts`.
3. Update task tracking (`BACKLOG.md`, `CURRENT.md`).
4. Run tests.

## Verification

- [x] Changed files formatted with Prettier.
- [x] Tests passed.

## Review

- [x] Task changes are scoped to Error handling mapping.
- [x] No regressions found in targeted checks.

## Status

DONE — Developed and tested error mapping logic.
