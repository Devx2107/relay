# Relay Backlog

Statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`.

Priorities reflect the 12-hour hackathon constraint. Work should follow the dependency order unless an integration discovery changes it. Every implementation task must use a task template and update `tasks/CURRENT.md`.

## P0 — Foundation

| ID      | Task                                                                              | Status | Depends on |
| ------- | --------------------------------------------------------------------------------- | ------ | ---------- |
| FND-001 | Repository bootstrap, docs, task system, quality gates, CI                        | DONE   | —          |
| FND-002 | Configure Supabase project, server client, migrations, and environment validation | DONE   | FND-001    |
| FND-003 | Add Google OAuth with Supabase Auth and protected session handling                | DONE   | FND-002    |
| FND-004 | Define minimal schema: users, conversations, messages, triage_items, agent_runs   | DONE   | FND-002    |
| FND-005 | Add Row Level Security and authorization tests for user-owned data                | DONE   | FND-004    |

## P0 — Integration Boundary

| ID      | Task                                                                                      | Status  | Depends on       |
| ------- | ----------------------------------------------------------------------------------------- | ------- | ---------------- |
| INT-001 | Inspect and document the actual Corsair/MCP API and authentication contract               | DONE    | FND-001          |
| INT-002 | Create a mockable Corsair integration boundary and tool result types                      | DONE    | INT-001          |
| INT-003 | Implement Gmail read/search and message-detail access                                     | DONE    | INT-002, FND-003 |
| INT-004 | Implement Gmail reply draft/send operations behind approval                               | DONE    | INT-003, AGT-004 |
| INT-005 | Implement Calendar read/upcoming-event access                                             | DONE    | INT-002, FND-003 |
| INT-006 | Implement Calendar availability lookup                                                    | DONE    | INT-005          |
| INT-007 | Implement Calendar event creation and invitation details                                  | DONE    | INT-005, AGT-004 |
| INT-008 | Add integration mocks, expired-session handling, rate-limit handling, and failure mapping | DONE    | INT-003, INT-005 |

## P0 — Shared Agent Foundation

| ID      | Task                                                                                    | Status      | Depends on       |
| ------- | --------------------------------------------------------------------------------------- | ----------- | ---------------- |
| AGT-001 | Define agent-run, intent, tool-call, status, and user-facing error contracts            | DONE        | FND-004          |
| AGT-002 | Add deterministic intent parsing for supported commands and validated structured output | DONE        | AGT-001          |
| AGT-003 | Add Groq adapter with bounded prompts, free-model configuration, and graceful fallback  | DONE        | AGT-001          |
| AGT-004 | Build shared read/write tool registry with server-side write classification             | DONE        | AGT-001, INT-002 |
| AGT-005 | Implement shared loop: parse → plan → read → propose → approve → execute → verify       | DONE        | AGT-002, AGT-004 |
| AGT-006 | Persist pending actions and enforce approval on the server, not only in the UI          | DONE        | FND-004, AGT-005 |
| AGT-007 | Add action verification and safe, user-readable error handling                          | DONE        | AGT-005, INT-008 |
| AGT-008 | Add conversational state for references within the current session                      | DONE        | FND-004, AGT-005 |
| AGT-009 | Add agent progress/status events without exposing chain-of-thought                      | DONE        | AGT-005          |

## P0 — Triage

| ID      | Task                                                                               | Status  | Depends on                |
| ------- | ---------------------------------------------------------------------------------- | ------- | ------------------------- |
| TRI-001 | Retrieve recent email and upcoming calendar inputs                                 | REVIEW | INT-003, INT-005          |
| TRI-002 | Implement documented deterministic ranking signals and optional LLM classification | BACKLOG | AGT-003, TRI-001          |
| TRI-003 | Define triage item persistence and 2–5 item response contract                      | BACKLOG | FND-004, TRI-002          |
| TRI-004 | Implement proactive triage on console load                                         | BACKLOG | TRI-003, UI-001           |
| TRI-005 | Add reply, ignore/archive, and supported snooze actions                            | BACKLOG | INT-004, TRI-003, AGT-006 |
| TRI-006 | Add editable reply draft and approval/send flow                                    | BACKLOG | TRI-005                   |

## P0 — Scheduling

| ID      | Task                                                                                                           | Status  | Depends on                         |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- |
| SCH-001 | Parse scheduling requests and identify attendees                                                               | BACKLOG | AGT-002, AGT-008                   |
| SCH-002 | Handle missing information with editable defaults: 30 minutes, Google Meet, primary calendar, account timezone | BACKLOG | SCH-001                            |
| SCH-003 | Find and rank 2–3 available slots                                                                              | BACKLOG | INT-006, SCH-001                   |
| SCH-004 | Prepare meeting details, invitation, and optional email as one proposed operation                              | BACKLOG | INT-004, INT-007, SCH-002, SCH-003 |
| SCH-005 | Build one combined approval card and execute only after server approval                                        | BACKLOG | AGT-006, SCH-004                   |
| SCH-006 | Verify created event/invitation and present success or actionable failure                                      | BACKLOG | AGT-007, SCH-005                   |

## P0 — Command Console UX

| ID     | Task                                                                                | Status  | Depends on      |
| ------ | ----------------------------------------------------------------------------------- | ------- | --------------- |
| UI-001 | Build the single command-console shell and authenticated route                      | BACKLOG | FND-003         |
| UI-002 | Render conversation messages, inline result cards, and action controls              | BACKLOG | AGT-008, UI-001 |
| UI-003 | Render safe agent progress/status states                                            | BACKLOG | AGT-009, UI-002 |
| UI-004 | Render approval, edit, cancel, and execute states for writes                        | BACKLOG | AGT-006, UI-002 |
| UI-005 | Add loading, empty, integration-error, expired-session, and unavailable-slot states | BACKLOG | AGT-007, UI-002 |

## P0 — Verification and Security

| ID      | Task                                                                                       | Status  | Depends on                         |
| ------- | ------------------------------------------------------------------------------------------ | ------- | ---------------------------------- |
| QLT-001 | Add unit tests for intent parsing, triage ranking, scheduling logic, and approval policy   | BACKLOG | AGT-002, AGT-006, TRI-002, SCH-003 |
| QLT-002 | Add mocked integration/API contract tests                                                  | BACKLOG | INT-008                            |
| QLT-003 | Add end-to-end happy paths for triage action and approved scheduling                       | BACKLOG | TRI-006, SCH-006, UI-004           |
| QLT-004 | Verify production build with no real credentials required at build time                    | BACKLOG | UI-005                             |
| QLT-005 | Review secrets, OAuth scopes, authorization, prompt safety, and write approval enforcement | BACKLOG | FND-005, AGT-006                   |

## P1 — Polish

| ID      | Task                                                | Status  | Depends on |
| ------- | --------------------------------------------------- | ------- | ---------- |
| POL-001 | Improve responsive layout and visual polish         | BACKLOG | UI-005     |
| POL-002 | Add keyboard-first interactions                     | BACKLOG | UI-005     |
| POL-003 | Add restrained loading/transition animation         | BACKLOG | UI-005     |
| POL-004 | Improve daily briefing copy and triage explanations | BACKLOG | TRI-004    |

## P2 — Stretch

| ID      | Task                                                                   | Status  | Depends on |
| ------- | ---------------------------------------------------------------------- | ------- | ---------- |
| EXT-001 | Add pgvector semantic search                                           | BACKLOG | QLT-004    |
| EXT-002 | Add realtime webhooks                                                  | BACKLOG | QLT-004    |
| EXT-003 | Add advanced proactive intelligence                                    | BACKLOG | QLT-004    |
| EXT-004 | Add additional automation only after an approved architecture decision | BACKLOG | QLT-005    |

## Recommended implementation order

```text
Supabase + Google Auth
  → Corsair boundary
  → Gmail/Calendar reads
  → Agent contracts and tool registry
  → Approval and verification
  → Scheduling
  → Triage
  → Command console and cards
  → Error/loading states
  → Tests and polish
  → Stretch goals
```
