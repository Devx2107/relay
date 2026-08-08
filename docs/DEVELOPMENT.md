# Development

Use Node.js 20+ and npm. Copy `.env.example` to `.env.local`, then run `npm install` and `npm run dev`.

The workflow is:

```text
Task → Inspect → Plan → Implement → Test → Review → Update Docs
```

Quality commands are `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. The combined gate is `npm run verify`; CI runs it on pushes to `main` and pull requests.

Use focused changes and conventional commit messages. Update `tasks/CURRENT.md` before implementation and keep secrets out of Git.

## Definition of Done

Acceptance criteria are met; formatting, lint, typecheck, tests, and build pass; security and regressions are reviewed; relevant documentation is updated; and no unrelated changes are included.
