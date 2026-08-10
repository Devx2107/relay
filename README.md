# Relay

Relay is an AI-native command console for email triage and calendar scheduling. It supports authenticated user sessions, server-side Gmail and Google Calendar integrations through Corsair, read-only triage, scheduling proposals, and approval-gated actions.

The application keeps external integrations behind server routes and services. Supabase provides authentication and persistence for users, conversations, messages, triage items, and agent runs. Read operations can run automatically; consequential actions require explicit server-enforced approval before execution and verification.

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

The main product workflows are implemented in the Next.js App Router application. See the architecture and workflow documentation for the current boundaries and supported behavior.
