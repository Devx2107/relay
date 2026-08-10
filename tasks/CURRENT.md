# Current Task

## Current Task: AGT-017 recognize calendar query language

## Goal

Recognize natural calendar queries such as “show my recent meetings” and “what do I have for tomorrow”.

## Context

The merged UI branch exposed parser gaps for recent meetings and date-oriented calendar questions.

## Requirements

- Treat recent meetings as calendar triage.
- Treat “what do I have for tomorrow” as a calendar read.
- Preserve inbox triage and calendar cancellation behavior.
- Add regression coverage for both forms.

## Acceptance Criteria

- “show my recent meetings” parses as calendar triage.
- “what do I have for tomorrow” parses as calendar triage.
- Existing upcoming and cancellation wording remains unchanged.

## Relevant Areas

- `lib/agent/intents.ts`
- `tests/agent.test.ts`

## Constraints

- Do not call external services from UI code.
- Keep calendar reads read-only and approval-free.
- Keep the change limited to parser reliability.

## Plan

1. Extend calendar query recognition.
2. Add regression coverage.
3. Run focused checks.

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
