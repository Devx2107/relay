# Architecture

The proposed architecture is a small Next.js App Router application with server-side agent APIs, Supabase Auth/Postgres, Groq for constrained language understanding, and Corsair as the Gmail/Calendar integration boundary.

```text
Next.js
├── UI / command console
├── Agent API
│   ├── intent and planner
│   └── tool registry
├── Supabase Auth + PostgreSQL
└── Corsair integration
    ├── Gmail
    └── Calendar
```

The shared loop is: parse → plan → read → prepare proposed writes → approval → execute → verify → present. UI components call application services, never external APIs directly. Write actions are persisted and validated server-side before execution.
