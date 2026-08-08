# Flow

Flow is an AI-native command console for email triage and calendar scheduling. This repository is currently in the engineering bootstrap phase; no product integrations or workflows are implemented yet.

## Quick start

Prerequisites: Node.js 20+ and npm.

```bash
npm install
Copy-Item .env.example .env.local # PowerShell; use cp on Unix
npm run dev
```

Run the full local quality gate with `npm run verify`.

## Project guidance

- Start with [AGENTS.md](AGENTS.md) for the AI development protocol.
- Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for commands and workflow.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the proposed design.
- Track work in [tasks/BACKLOG.md](tasks/BACKLOG.md) and [tasks/CURRENT.md](tasks/CURRENT.md).

Feature implementation is intentionally paused until the proposed structure and workflow are approved.
