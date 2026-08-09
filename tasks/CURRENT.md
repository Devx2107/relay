# Current Task

## Current Task: Prepare one combined scheduling proposal (SCH-004)

## Goal

Prepare meeting details, invitation details, and an optional email as one validated scheduling proposal after availability has been checked.

## Context

SCH-001 parses attendees, SCH-002 supplies validated duration/calendar/provider/timezone options, and SCH-003 produces up to three safe ranked slots. The agent loop still sends scheduling runs through generic write-tool proposal logic, which can split or reshape a meeting operation. SCH-004 adds one deterministic proposal boundary for the later combined approval/execution work.

SCH-005 owns the combined approval card and execution; SCH-006 owns verification.

## Requirements

- Build one bounded scheduling proposal from the parsed intent and ranked slots.
- Include title, selected slot, alternatives, duration, provider, calendar, timezone, and canonical attendees.
- Represent invitation recipients separately from event details.
- Include optional email data only when explicitly supplied and validated; never invent recipients or content.
- Keep proposal creation deterministic, serializable, side-effect free, and free of raw busy data.
- Route valid scheduling runs to `waiting_for_approval` with this combined proposal; do not execute writes in SCH-004.

## Acceptance Criteria

- [x] A pure builder validates inputs and returns one combined, serializable proposal.
- [x] The proposal contains a selected ranked slot, bounded alternatives, and invitation recipients.
- [x] Optional email data is opt-in and validated; absent email data is omitted.
- [x] Scheduling runs with available slots wait for approval with the combined proposal and no write tool execution.
- [x] No-slot and availability-error paths remain safe and actionable.
- [x] Unit tests cover valid proposals, missing attendees/slots, title handling, alternatives, and email validation.
- [x] Existing scheduling, triage, formatting, lint, typecheck, tests, and build remain passing.

## Dos and Don'ts

### Proposal data

Do:

- Use only parsed SCH-002 options, canonical attendees, and SCH-003 slots.
- Keep one proposal envelope with separate event and invitation sections.
- Preserve alternatives for later user selection without claiming any slot is reserved.

Don't:

- Create an event, invitation, meeting link, or email in this task.
- Forward raw busy intervals, provider payloads, credentials, or model reasoning.
- Guess attendees, timezones, titles, or email recipients beyond explicit input.

### Optional email

Do:

- Omit the email section unless it is explicitly provided and passes bounded validation.
- Keep email recipients, subject, and body visible in the proposal for later approval.

Don't:

- Send email or silently add an email side effect to calendar creation.
- Manufacture email content from incomplete user intent.

## Relevant Areas

- `lib/scheduling-proposal.ts`
- `lib/agent/contracts.ts`
- `lib/agent/loop.ts`
- `tests/scheduling-proposal.test.ts`
- `docs/SCHEDULING.md`

## Implementation Plan

1. Define the combined proposal contract and pure builder.
2. Validate title, slot, attendee, alternatives, and optional email fields.
3. Wire the builder into the scheduling read path so one proposal reaches the approval boundary.
4. Add focused unit tests and update scheduling documentation.
5. Run formatting, lint, typecheck, tests, build, and security/scope review.

## Tests

- Valid proposal with selected slot and alternatives.
- Default and explicit bounded title handling.
- Missing attendees/slots and invalid alternatives.
- Optional email omission and validation failures.
- Agent-loop scheduling proposal metadata with no write execution.

## Verification

- [x] Formatting
- [x] Lint
- [x] Typecheck
- [x] Tests
- [x] Build
- [x] Security and scope review

## Documentation Impact

- Update `docs/SCHEDULING.md` with the combined proposal shape and no-side-effect boundary.
- Update `docs/AGENT.md` with deterministic scheduling proposal preparation.
- Update `docs/SECURITY.md` if the proposal redaction boundary adds a new invariant.

## Status

DONE - Implemented deterministic combined scheduling proposal preparation; writes remain deferred to SCH-005 server approval/execution.
