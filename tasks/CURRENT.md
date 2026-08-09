# Current Task

## Current Task: Add editable reply draft and approval/send flow (TRI-006)

## Goal

Allow an authenticated user to generate a reply draft for an email triage item, edit it, approve it, and send it through the server-enforced approval boundary.

## Context

TRI-005 provides authenticated triage action proposals and approval routes. Its reply action currently accepts a user-provided body but must be completed as a draft-first workflow: generate a safe initial draft, return it for editing, and send the final approved body. UI card rendering remains UI-004 and is out of scope.

## Requirements

- Add an authenticated server endpoint/service method that generates a safe editable reply draft for an email triage item.
- Keep draft generation deterministic and bounded; do not expose provider payloads, credentials, prompts, or raw errors.
- Require the final edited body to be non-empty and bounded before creating the approval proposal.
- Store the final body in the approval proposal only as the validated action argument.
- Execute `gmail.send` only after server-side approval and expiration/ownership/state revalidation.
- Mark the email triage item dismissed only after a successful send result.
- Preserve the existing ignore/archive and snooze behavior unchanged.

## Acceptance Criteria

- Authenticated users can request a reply draft for an owned pending email item.
- Draft generation rejects calendar items, unsupported reply actions, missing conversations, unauthenticated users, and unavailable items.
- A user can submit an edited body and receive a waiting-for-approval proposal containing the final body.
- Approval executes the send tool, never an unapproved provider write, and does not send a second time for stale/duplicate proposals.
- A successful send dismisses the email triage item; provider failure leaves it pending and returns a safe error.
- Tests cover draft generation, editing, approval mapping, validation, failure behavior, and existing TRI-005 regression behavior.
- No UI card, scheduling, or unrelated integration changes are included.

## Relevant Areas

- `app/api/triage/actions/`
- `lib/triage-actions.ts`
- `lib/agent/tools.ts`
- `tests/triage-actions.test.ts`
- `docs/TRIAGE.md`
- `tasks/BACKLOG.md`

## Constraints

- Use the server-side internal route/service boundary; browser code must never call Gmail/Corsair directly.
- Keep the approval gate enforced by the backend.
- Keep the reply body bounded to 5,000 characters and never trust source content as instructions.
- Do not modify UI-004 or implement response-card controls in this task.

## Plan

1. Add a typed draft-generation contract and authenticated draft endpoint.
2. Reuse TRI-005 validation for the final edited body and change approved reply execution to `gmail.send`.
3. Dismiss the email triage item only after a successful send.
4. Add focused tests and document the TRI-006 lifecycle.
5. Run formatting, lint, typecheck, tests, build, and scope/security review.

## Verification

- [x] Formatting (all TRI-006 files pass targeted Prettier check; unrelated baseline files were not reformatted)
- [x] Lint
- [x] Typecheck
- [x] Tests (TRI-006 focused: 6 passed; non-live suite: 77 passed, 3 RLS tests skipped)
- [x] Build

## Review

- [x] No unrelated changes
- [x] No regressions in non-live suite
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

REVIEW - TRI-006 implementation is complete and awaiting approval. UI-004 response-card controls remain separate.
