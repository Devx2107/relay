# Current Task

## Current Task: TRI-014 responsive persistent daily briefing

## Goal

Make the daily Gmail/Calendar briefing faster and keep persisted triage state consistent across refreshes.

## Context

The briefing retrieves Gmail and Calendar in parallel, but classification is serial and persistence upserts refreshed rows as pending. This causes visible lag and can resurrect dismissed or snoozed items.

## Requirements

- Classify independent briefing candidates with bounded concurrency.
- Preserve existing triage status during refresh upserts.
- Reconcile disappeared items only for sources fetched successfully.
- Keep unavailable sources and their stored items intact.

## Acceptance Criteria

- Daily briefing classification no longer waits serially for every candidate.
- Dismissed/snoozed items are not reset to pending by refresh.
- Removed source items are reconciled without deleting data.

## Relevant Areas

- `lib/triage-briefing.ts`
- `lib/triage-ranking.ts`
- `lib/triage-items.ts`
- `tests/triage-briefing.test.ts`
- `tests/triage-items.test.ts`

## Constraints

- Do not call external services from UI code.
- Do not bypass the tool registry or approval requirement.
- Keep the change limited to planner reliability.

## Plan

1. Parallelize bounded candidate classification.
2. Preserve statuses and reconcile stale source items.
3. Add regression coverage and run checks.

## Verification

- [x] Formatting (changed files; pre-existing `tasks/BACKLOG.md` and `lib/agent/groq.ts` remain unformatted)
- [x] Lint
- [x] Typecheck
- [ ] Focused tests
- [x] Build
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

IN PROGRESS
