# AI Agent Instructions

## Scope

Relay is a 12-hour hackathon project focused on one command console with two capabilities: triage and scheduling. Keep the system small, integration-first, and testable.

## Required task protocol

Before changing code, document Goal, Context, Requirements, Acceptance Criteria, Relevant Areas, Constraints, and Plan in `tasks/CURRENT.md`. Inspect existing code first. Implement the smallest coherent change, test it, review security and scope, and update documentation.

## Safety boundaries

- Do not implement product features during bootstrap.
- Read operations may be automatic; consequential writes require server-enforced approval.
- Keep Corsair behind an integration boundary; UI code must not call external services directly.
- Never commit secrets or expose service-role credentials in browser code.
- Do not invent SDK/API behavior; verify integrations before relying on them.

## Definition of Done

A change is complete when acceptance criteria are met, formatting/lint/typecheck/tests/build pass, security and regressions are reviewed, relevant docs are updated, and no unrelated files changed.
