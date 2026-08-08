# Current Task

## Current Task: Add agent progress/status events without exposing chain-of-thought (AGT-009)

## Goal

Add detailed, user-friendly agent progress and status events to the system without exposing raw chain-of-thought, internal tool calls, or JSON structures.

## Context

The UI needs to render detailed agent progress dynamically, such as when the agent is querying calendar events or searching emails. Emitting granular progress events per tool call prevents a black-box experience without leaking internal LLM rationale.

## Requirements

- Emit progress events for individual tool calls using human-readable strings from `TOOL_DEFINITIONS`.
- Persist progress events in the database inside the `metadata` JSONB block as `progressEvents`.
- Ensure backwards compatibility with other metadata properties.

## Acceptance Criteria

- `AgentLoop.execute` emits tool-specific progress statuses.
- `AgentService.startRun` tracks and persists these events to Supabase.
- `AgentService.approveRun` tracks and persists events correctly.
- `SafeMetadata` is strongly typed with `progressEvents`.

## Relevant Areas

- `lib/agent/contracts.ts`
- `lib/agent/loop.ts`
- `lib/agent/service.ts`

## Constraints

- Only use valid `AgentProgressStatus` values for `status`.
- Do not expose LLM internals in the message text.

## Plan

1. **Contracts**: Add `progressEvents?: AgentProgressEvent[]` to `SafeMetadata`.
2. **Loop**: Replace generic "Reading data..." with per-tool calls to `onProgress`.
3. **Service**: Track an array of `events` and persist them to `metadata.progressEvents`.
4. **Verification**: Run `npm run test` to verify changes.

## Verification

- [x] Changed files formatted with Prettier.
- [x] Typecheck passes.
- [x] Tests pass.
- [x] Build passes.

## Status

DONE — AGT-009 is implemented.
