# Current Task

## Current Task: AGT-016 recognize calendar management follow-ups

## Goal

Recognize contextual requests such as “cancel this meeting” as calendar management commands.

## Context

The parser recognizes calendar reads but rejects cancellation/rescheduling language when the user refers to the previously discussed meeting.

## Requirements

- Treat cancellation/rescheduling requests referring to meetings or events as calendar triage.
- Route calendar cancellation through the existing read, proposal, and approval pipeline.
- Force the appropriate calendar write tool during proposal generation.
- Build cancellation arguments from the verified calendar read result when available.
- Preserve read-only behavior for ordinary calendar triage.
- Add regression coverage for the new wording and the existing upcoming-meetings wording.

## Acceptance Criteria

- “cancel this meeting” parses as calendar triage.
- Calendar deletion is proposed only after the event is read and requires approval.
- Existing calendar wording remains unchanged.

## Relevant Areas

- `lib/agent/intents.ts`
- `tests/agent.test.ts`

## Constraints

- Do not call external services from UI code.
- Keep calendar reads read-only and approval-free.
- Keep the change limited to parser reliability.

## Plan

1. Extend the calendar triage wording.
2. Add regression coverage.
3. Run focused checks where available.

## Verification

- [x] Formatting (changed files; pre-existing `tasks/BACKLOG.md` and `lib/agent/groq.ts` remain unformatted)
- [x] Lint
- [x] Typecheck
- [ ] Focused tests
- [ ] Build
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

IN PROGRESS
