# Current Task

## Current Task: Retrieve recent email and upcoming calendar inputs (TRI-001)

## Goal

Provide the triage flow with a single, server-side retrieval step that gathers recent Gmail threads and upcoming Google Calendar events for the authenticated tenant.

## Context

TRI-001 is the next dependency-ready P0 task. The Gmail and Calendar adapters from INT-003 and INT-005 are implemented behind the mockable `IntegrationService` boundary. Triage currently has documentation describing email and calendar inputs, but no dedicated orchestration or normalized input contract. Ranking, classification, persistence, and UI presentation belong to later TRI tasks.

## Requirements

- Retrieve recent inbox email using the existing `GmailService` adapter.
- Retrieve upcoming calendar events from the current time using the existing `CalendarService` adapter.
- Keep tenant identity and external calls on the server-side integration boundary.
- Define a small, typed result contract that can carry both source results and source-specific integration failures.
- Preserve the existing integration error categories so authentication, permission, rate-limit, and unavailable-service states remain actionable.
- Make the retrieval logic mockable without requiring live Gmail or Calendar accounts.

## Acceptance Criteria

- A dedicated triage input retrieval service can request recent email and upcoming events for a tenant.
- Email and calendar requests use the existing adapters and expected default limits/time window.
- Successful results are returned in a stable typed shape without ranking or classification.
- A failure from one source is represented without leaking provider internals or preventing the other source from being handled according to the chosen contract.
- Unit tests cover both-source success, adapter call arguments, and integration failure mapping.
- No UI code calls Corsair, Gmail, or Calendar directly.

## Relevant Areas

- `lib/gmail.ts`
- `lib/calendar.ts`
- `lib/integration.ts`
- `lib/integration-mock.ts`
- `lib/agent/tools.ts`
- `docs/TRIAGE.md`
- `tests/gmail.test.ts`
- `tests/calendar.test.ts`
- `tests/integration.test.ts`

## Constraints

- Do not implement deterministic ranking, LLM classification, triage-item persistence, or proactive console loading; those are TRI-002 through TRI-004.
- Keep Corsair behind the existing integration boundary.
- Do not expose credentials, raw provider errors, or internal agent reasoning.
- Read operations may run automatically; no write operation is part of this task.
- Normal tests must use mocks and must not require live accounts.

## Plan

1. **Inspect contracts**: Confirm the existing Gmail, Calendar, integration, and tool result shapes and identify the smallest triage-facing contract.
2. **Implement retrieval**: Add a server-side triage input service that retrieves both sources through the existing adapters and maps failures safely.
3. **Test**: Add focused unit tests for successful retrieval, tenant-scoped adapter calls, defaults, and partial/provider failures.
4. **Review and verify**: Run formatting, lint, typecheck, tests, and build; review approval boundaries, secret handling, and scope.
5. **Document status**: Update this task with verification results and mark the backlog task `REVIEW` only after implementation is verified.

## Verification

- [x] Pre-implementation inspection complete.
- [x] Formatting passes for changed implementation and test files.
- [ ] Lint passes; blocked by the repository's existing ESLint 9/Next config circular-structure error.
- [x] Typecheck passes.
- [x] Tests pass (50 tests, including 3 TRI-001 tests).
- [x] Build passes.
- [x] Security and scope review complete.

## Status

REVIEW — TRI-001 is implemented and verified; repository lint configuration remains an existing follow-up issue.
