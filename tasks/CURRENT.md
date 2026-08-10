# Current Task

## Current Task: AGT-012 valid Groq summary requests

## Goal

Ensure the read-only triage summary request is valid when the planner has already used Gmail or Calendar tools.

## Context

The read-only triage path now asks Groq for a final summary after tool calls. It currently forwards assistant `tool_calls` and `tool` messages while sending no tools, which Groq rejects with `Tool choice is none, but model called a tool`.

## Requirements

- Form a valid summary request after read-tool execution.
- Preserve the read-only triage boundary and explicit approval-gated triage actions.
- Add regression coverage preventing tool-call messages in no-tool summary requests.

## Acceptance Criteria

- Summary requests contain no assistant `tool_calls` or `tool` role when sent without tools.
- A triage command completes with a read summary or bounded fallback.
- Explicit triage action proposals remain approval-gated and executable through their existing API.

## Relevant Areas

- `lib/agent/loop.ts`
- `tests/loop.test.ts`
- `docs/AGENT.md`

## Constraints

- Do not call external services from UI code.
- Do not bypass the tool registry or approval requirement.
- Keep the change limited to planner reliability.

## Plan

1. Inspect the summary request and Groq message contract.
2. Normalize the tool transcript into ordinary summary context.
3. Add focused regression coverage.
4. Run checks and review security and scope.

## Verification

- [x] Formatting (changed files; pre-existing `tasks/BACKLOG.md` and `lib/agent/groq.ts` remain unformatted)
- [x] Lint
- [x] Typecheck
- [x] Focused tests (`tests/loop.test.ts`, `tests/triage-actions.test.ts`)
- [x] Build
- [x] Security and scope review

## Review

- [x] No unrelated changes
- [x] No regressions
- [x] No unnecessary complexity
- [x] Security reviewed
- [x] Documentation updated

## Status

COMPLETE
