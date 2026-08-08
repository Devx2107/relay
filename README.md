# Relay

Relay is an AI-native command console for email triage and calendar scheduling. The server-side Corsair boundary for Gmail and Google Calendar is now scaffolded; product workflows and authenticated user sessions are not implemented yet.

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

Product workflow implementation remains paused until the proposed structure, authentication, and approval boundaries are approved.
