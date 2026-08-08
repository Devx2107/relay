# Setup

Install Node.js 20+ and npm. Copy `.env.example` to `.env.local`; never commit the local file.

For the current Corsair integration, set `DATABASE_URL` to the Supabase IPv4 session-pooler connection string. It is used only by the server-side `pg` pool. Set the Corsair Hub project API key, signing secret, and KEK as well. These values are validated when a Corsair request reaches the server, so builds and tests do not require live credentials.

Apply the Corsair migration in `supabase/migrations/` through the Supabase SQL editor or your migration workflow before starting the route. The first request to `/api/corsair` then initializes the server-side Corsair instance against that database.

Supabase Auth, Google OAuth, and browser-safe Supabase client variables are intentionally not part of this integration slice. Supabase service-role keys and database URLs must remain server-only.

Local development starts with `npm run dev`; repository verification uses `npm run verify`.
