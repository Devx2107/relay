# Current Task

## Task

INT-003 — Implement Gmail read/search and message-detail access

## Goal

Create a domain service that wraps the `IntegrationService` to provide strongly-typed, simplified methods for interacting with Gmail (searching threads and reading message details).

## Context

The agent needs a simplified interface to retrieve unread threads and email context from the user's inbox. Wrapping `IntegrationService` inside `GmailService` creates a clean domain API for the rest of the application without hard-coding raw Corsair action paths.

## Requirements

- Implement `searchThreads` mapping to `api.threads.list`.
- Implement `getThread` mapping to `api.threads.get`.
- Add test suite in `tests/gmail.test.ts`.

## Acceptance Criteria

- `lib/gmail.ts` is implemented.
- `tests/gmail.test.ts` is implemented and passes.
- Mocking properly simulates the tool calls without real Gmail access.

## Relevant Files

- `lib/gmail.ts`
- `tests/gmail.test.ts`
- `tasks/BACKLOG.md`
- `tasks/CURRENT.md`

## Constraints

- Continue using the mock service for tests. No live external requests.

## Plan

1. Create `lib/gmail.ts`.
2. Create `tests/gmail.test.ts`.
3. Update task tracking (`BACKLOG.md`, `CURRENT.md`).
4. Run tests.

## Verification

- [x] Changed files formatted with Prettier.
- [x] Tests passed.

## Review

- [x] Task changes are scoped to Gmail read integration.
- [x] No regressions found in targeted checks.

## Status

DONE — Gmail read boundary built and tested.
