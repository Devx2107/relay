# Current Task

## Task

AGT-004 — Build shared read/write tool registry with server-side write classification.

## Goal

Create a strict server-side registry between agent code and `IntegrationService` so only allowlisted tools can execute and consequential writes cannot bypass approval.

## Context

AGT-001 defines `AgentToolCall` and `AgentToolResult`, while the existing integration boundary can execute arbitrary plugin/action paths. AGT-004 adds the missing policy layer before the shared agent loop and approval persistence are implemented.

## Requirements

- Define tool descriptors with logical ID, plugin, action, operation, availability, and argument metadata.
- Strictly resolve only registered logical tool IDs; callers cannot provide arbitrary plugin/action paths.
- Register current Gmail and Calendar read tools using their verified Corsair action paths.
- Register planned email and calendar write tools as guarded entries without inventing unverified action paths.
- Reject caller-supplied operation classifications that do not match the server registry.
- Execute available reads through an injected `IntegrationService` with tenant scope preserved.
- Return `approval_required` for available writes without calling `IntegrationService`.
- Return a safe unavailable error for planned tools without calling `IntegrationService`.

## Acceptance Criteria

- Current read tools resolve and map to the expected plugin/action/arguments.
- Unknown tools and operation mismatches are rejected.
- Read execution records the original tenant ID and reaches only the injected integration service.
- No write request reaches `IntegrationService` before AGT-006.
- Planned tools cannot execute or invent external action paths.
- Tests, typecheck, build, and targeted formatting pass.
- Documentation and task tracking describe the registry and write policy.

## Relevant Files

- `lib/agent/tools.ts`
- `lib/agent/contracts.ts`
- `lib/integration.ts`
- `tests/tools.test.ts`
- `docs/AGENT.md`
- `tasks/BACKLOG.md`
- `tasks/CURRENT.md`

## Constraints

- Use a strict server-side allowlist.
- Preserve tenant scope and existing `IntegrationService` result mapping.
- Do not persist approvals; that belongs to AGT-006.
- Do not add live external requests, UI behavior, or guessed Corsair action paths.
- Planned writes remain guarded until INT-004/INT-007 verify their concrete integrations.

## Plan

1. Define current and planned tool descriptors with explicit operation and availability metadata.
2. Implement strict lookup and an execution boundary around `IntegrationService`.
3. Add mocked tests for mapping, rejection, tenant propagation, read execution, write blocking, and planned-tool guarding.
4. Document the registry vocabulary and approval boundary.
5. Run formatting, lint, typecheck, tests, and build; review security and scope.

## Verification

- [x] Changed files formatted with Prettier.
- [ ] Lint passes — repository ESLint configuration currently fails before file linting with an ESLint 9 circular-config error.
- [x] Typecheck passes.
- [x] Tests pass.
- [x] Build passes.

## Review

- [x] Registry allowlist is authoritative for plugin/action/operation.
- [x] No write reaches `IntegrationService` before approval support exists.
- [x] Planned entries contain no invented external action path.
- [x] Tenant scope and structured arguments are preserved.
- [x] Changes are scoped to AGT-004.

## Status

DONE — Strict tool registry implemented and verified; repository lint remains blocked by pre-existing ESLint configuration.
