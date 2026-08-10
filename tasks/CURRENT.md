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

## Additional Debugging Task: serialize agent run persistence

### Goal

Prevent asynchronous progress updates from overwriting completed run metadata.

### Context

Read-only calendar summaries and approval proposals can disappear when a pending progress database update finishes after the final run update.

### Requirements

- Serialize progress updates for newly started runs.
- Serialize progress updates during approved-run execution.
- Preserve final summaries, proposed actions, and execution metadata.
- Add regression coverage for the persistence ordering.

### Acceptance Criteria

- A completed read run retains `finalSummary`.
- A waiting-for-approval run retains its proposal metadata.
- Approved execution retains its final metadata and status.

### Relevant Areas

- `lib/agent/service.ts`
- `tests/service.test.ts`

### Constraints

- Keep the change server-side and limited to run persistence.
- Do not change approval requirements or integration behavior.

### Plan

1. Serialize progress persistence and await it before final persistence.
2. Add regression coverage.
3. Run focused checks and review scope.

## Additional Feature Task: standardize chat result templates

### Goal

Present email and calendar reads in consistent, useful templates and require explicit meeting selection before cancellation is proposed.

### Requirements

- Render email triage as a Markdown table with number, subject, and summary columns.
- Render calendar reads with consistent timing, location, attendees, topic, and description fields.
- Show cancellable upcoming meetings in a dropdown with their descriptions.
- Keep all calendar deletion server-approved and use the user-selected event id.

### Acceptance Criteria

- Email and calendar read responses have stable server-generated formats.
- A cancel request displays a meeting selector before creating an approval proposal.
- Selecting a meeting creates the existing approval-gated cancellation proposal.

### Relevant Areas

- `lib/agent/loop.ts`
- `app/components/command-console.tsx`
- `app/api/`

### Constraints

- Do not expose external integrations to UI code.
- Do not execute a deletion before server-enforced approval.

### Plan

1. Add deterministic result formatters and meeting-selection metadata.
2. Render templates and the cancellation selector in the console.
3. Add tests and run focused validation.

### Verification

- [x] Formatting
- [x] Lint
- [x] Typecheck
- [x] Focused agent tests
- [x] Full test suite
- [x] Production build

### Review

- [x] Templates are generated server-side from read results.
- [x] The UI does not call external integrations directly.
- [x] Calendar deletion remains approval-gated after explicit selection.
- [x] No secrets were added.

### Status

COMPLETE

## Follow-up: derive email triage subjects from Gmail thread payloads

### Goal

Show a useful subject in every email-triage table row.

### Requirements

- Read nested Gmail message subject headers for thread-list results.
- Derive a compact fallback subject from the preview when no header is available.
- Preserve the existing email table structure.

### Acceptance Criteria

- Gmail thread entries display their actual `Subject` header when present.
- Entries without a subject header do not display `Not specified` when preview text is available.

### Relevant Areas

- `lib/agent/loop.ts`
- `tests/loop.test.ts`

### Plan

1. Extend subject extraction for nested thread messages.
2. Add regression coverage.
3. Run focused checks.
