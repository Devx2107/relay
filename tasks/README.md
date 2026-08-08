# Tasks

`BACKLOG.md` is the prioritized, dependency-aware queue. `CURRENT.md` is the one active task and must always identify its goal, context, requirements, acceptance criteria, relevant areas, constraints, plan, verification, and review state.

## Workflow

1. Select the highest-priority task whose dependencies are complete.
2. Copy the appropriate template into a task note when the task needs more detail.
3. Update `CURRENT.md` before changing code.
4. Inspect first, implement the smallest coherent change, and test it.
5. Review security, approval boundaries, scope, and documentation.
6. Mark the task `REVIEW` only after verification; mark it `DONE` after review.

## Scope rules

- The MVP is one command console with triage and scheduling—not a Gmail or Calendar clone.
- Read operations can be automatic; consequential writes require server-enforced approval.
- Corsair remains behind an integration boundary and live accounts are not required for normal tests.
- Groq is an assistant for bounded structured language tasks, not the authority for actions.
- Do not start P1/P2 work while required P0 paths remain incomplete.
