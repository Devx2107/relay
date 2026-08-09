# Current Task

## Current Task: EXT-001 pgvector semantic search

## Goal

Improve the command console’s responsive layout and visual polish as required by POL-001.

## Context

QLT-005 is the final P0 verification item. The review must cover both API authorization and the agent’s write boundary, while preserving the integration abstraction and approval requirement.

## Requirements

- Define the embedding provider, model, and vector dimension before schema changes.
- Define which user-owned content is indexed and how queries are authenticated.
- Keep semantic search behind the server/database boundary.
- Do not modify EXT-002, EXT-003, or EXT-004.

## Acceptance Criteria

- A concrete embedding and query contract exists.
- Search results remain user-scoped and do not expose cross-account content.
- The implementation is usable rather than only adding an unpopulated vector column.
- No unrelated product behavior changes are included.

## Relevant Areas

- `supabase/migrations/*`
- `lib/db.ts`
- `lib/supabase/server.ts`
- A future embedding/search service boundary

## Constraints

- Do not invent an embedding provider, model, or vector dimension.
- Do not add credentials or external services without an explicit architecture decision.
- Do not modify EXT-002, EXT-003, or EXT-004.

## Plan

1. Inspect existing schema and search/integration boundaries.
2. Select the embedding provider, model, dimension, and indexed content.
3. Implement the smallest authenticated pgvector search path.
4. Run checks and record EXT-001 completion only.

## Verification

- [ ] Formatting
- [ ] Lint
- [ ] Typecheck
- [ ] Tests
- [ ] Build
- [ ] Security and scope review

## Review

- [ ] No unrelated changes
- [ ] No regressions
- [ ] No unnecessary complexity
- [ ] Security reviewed
- [ ] Documentation updated

## Status

REVIEW - EXT-001 is blocked pending an embedding provider, model/dimension, indexed content, and query-scope decision; no code changed.
