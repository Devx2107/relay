# Setup

Install Node.js 20+ and npm. Copy `.env.example` to `.env.local`; never commit the local file.

The planned environment requires Supabase URL/anon key, Google OAuth credentials, Groq API access, and Corsair/MCP connection details. Exact SDK-specific names should be finalized when each integration task begins. Supabase service-role keys must remain server-only.

Local development starts with `npm run dev`; repository verification uses `npm run verify`.
