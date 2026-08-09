# Current Task

## Current Task: Add reply, ignore/archive, and supported snooze actions (TRI-005)

## Goal

Provide authenticated, approval-gated actions for persisted triage items without exposing provider integrations to the browser or bypassing server-side ownership checks.

## Context

TRI-001 through TRI-004, UI-001, INT-004, and AGT-006 are complete or in review. `triage_items` stores authenticated ranked candidates, and `agent_runs` is the existing server-enforced approval store. TRI-005 adds action proposals and execution boundaries without implementing the editable reply UI owned by TRI-006.

## Requirements

- Authenticate every action request with the server Supabase client.
- Verify item ownership, pending status, source, and supported action before creating a proposal.
- Support email reply-draft, email archive/ignore, calendar local dismissal, and bounded snooze presets.
- Require every consequential provider operation to use the persisted approval flow.
- Revalidate ownership, pending status, action, and expiration during approval/execution.
- Keep provider details, credentials, prompts, and raw errors out of responses and persisted metadata.

## Acceptance Criteria

- Authenticated users can create and list action proposals through internal routes.
- Email archive and reply-draft provider calls execute only after server approval.
- Calendar ignore performs only an authenticated local dismissal; snooze never accepts arbitrary durations.
- Rejected ownership, stale state, unsupported action, expired proposal, and duplicate action requests do not execute.
- Provider failures map to safe user-facing errors and do not mutate completed triage state.
- Tests cover action validation, approval enforcement, execution, state transitions, isolation, and failure handling.

## Relevant Areas

- `app/api/triage/actions/`
- `lib/triage-actions.ts`
- `lib/agent/service.ts`
- `lib/agent/tools.ts`
- `lib/gmail.ts`
- `lib/triage-items.ts`
- `supabase/migrations/`

## Constraints

- Use a server-side internal route/service boundary; UI code must never call Corsair or provider APIs directly.
- Ignore means Gmail archive for email and local dismissal for calendar.
- Snooze presets are one hour, tomorrow, and next week, stored locally in triage content metadata.
- Keep editable reply composition, send UX, and response-card controls out of scope for TRI-005/006.

## Plan

1. **Define action contracts**: Add typed action, snooze, proposal, and safe response contracts.
2. **Add action service**: Validate ownership/state, create approval proposals, list proposals, and perform approval-time local state transitions.
3. **Extend tools**: Add Gmail archive and local triage tools behind the existing registry approval gate.
4. **Expose routes**: Add authenticated proposal/list and approval endpoints with safe errors and no-store responses.
5. **Test and document**: Add focused service/tool/route tests and document semantics, state transitions, and fallback behavior.
6. **Review and verify**: Run formatting, lint, typecheck, full tests, build, and security/scope review.

## Verification

- [x] Repository and approval-flow inspection complete.
- [x] Formatting passes.
- [x] Lint passes.
- [x] Typecheck passes.
- [x] Tests pass (78 tests).
- [x] Build passes.
- [x] Security and scope review complete.

## Status

REVIEW - TRI-005 is implemented and verified. Editable reply composition, final send UX, and action-card UI remain TRI-006/UI scope.
