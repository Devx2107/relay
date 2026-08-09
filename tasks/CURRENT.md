# Current Task

## Current Task: Route approved Gmail replies through RFC2822 construction

## Goal

Ensure approved triage replies and reply drafts use the existing RFC2822 MIME construction before reaching Gmail.

## Context

`GmailService` already constructs correctly threaded RFC2822 payloads, but the tool definitions currently route `gmail.send` and `gmail.reply_draft` directly to Corsair. Approved triage actions provide only `{ threadId, body }`, so the RFC2822 methods are never used.

## Requirements

- Route `gmail.send` and `gmail.reply_draft` through the server-side local executor.
- Reuse `GmailService.sendReply()` and `createReplyDraft()` for raw MIME/threading construction.
- Keep `gmail.archive_thread` on its existing direct integration mapping.
- Add regression coverage at the registry integration boundary.

## Acceptance Criteria

- Approved send and draft calls fetch the source thread before invoking Gmail send/draft.
- The outgoing call contains the RFC2822 `raw` payload and threading headers.
- Lint, typecheck, formatting, tests, and build pass.
- Lint, typecheck, formatting, tests, and build pass.
- No unrelated product behavior changes are included.

## Relevant Areas

- `lib/gmail.ts`
- `lib/agent/tools.ts`
- `lib/agent/service.ts`
- `tests/gmail.test.ts`
- `tests/service.test.ts`

## Constraints

- Keep provider calls mocked in normal tests.
- Preserve the server-side approval boundary.
- Do not modify scheduling execution behavior.
- Keep the verified scheduling proposal path unchanged.
- Keep provider calls server-side and approval-gated.

## Plan

1. Inspect Gmail construction and registry wiring.
2. Make reply tools use the injected local executor.
3. Add focused RFC2822 execution coverage.
4. Run targeted and full checks and review security/scope.

## Verification

- [x] Formatting (targeted task files)
- [x] Lint
- [x] Typecheck
- [x] Tests (106 passed, 3 live RLS tests skipped without opt-in)
- [x] Build
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

REVIEW - Approved Gmail replies now use RFC2822 construction and are awaiting review.
