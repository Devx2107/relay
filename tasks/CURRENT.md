# Current Task

## Current Task: AGT-010 reliable planner tool responses

## Goal

Fix the shared agent loop so planner responses produce valid tool calls and gracefully handle planner failures.

## Context

Users report that plan responses fail frequently and do not return useful responses. The loop currently generates an overly broad tool schema and trusts planner tool names during the read phase.

## Requirements

- Emit accurate JSON-schema types and required fields for planner tools.
- Execute only available read tools during planning.
- Convert unexpected planner failures into bounded failed runs.
- Preserve the server-side registry and approval boundary.

## Acceptance Criteria

- Valid calendar availability and Gmail read calls can be represented by the planner schema.
- Unknown/write planner calls cannot execute during the read phase.
- An unexpected planner exception produces a user-facing failed run rather than an unhandled request failure.
- Existing triage, scheduling, approval, and verification behavior remains intact.

## Relevant Areas

- `lib/agent/loop.ts`
- `tests/loop.test.ts`
- `docs/AGENT.md`

## Constraints

- Do not call external services from UI code.
- Do not bypass the tool registry or approval requirement.
- Keep the change limited to planner reliability.

## Plan

1. Inspect the existing loop, adapter, registry, and tests.
2. Correct planner tool schemas and read-phase validation.
3. Add focused regression coverage.
4. Run checks and review security and scope.

## Verification

- [x] Formatting (changed files; pre-existing `tasks/BACKLOG.md` remains unformatted)
- [x] Lint
- [x] Typecheck
- [x] Tests
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
