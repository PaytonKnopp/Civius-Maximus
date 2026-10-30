# backend

Supabase configuration for Civius Maximus (docs/01-architecture.md, "Accounts"): the SQL
migration with row-level security for accounts (profiles), cloud saves and public lobbies.

- `supabase/migrations/0001_accounts_saves_lobbies.sql`: run it once in your project's SQL
  editor (or `supabase db push`). It's safe to run again.

The client talks to it with plain REST calls (`packages/client/src/cloud/cloud.ts`), switched
on by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time or a URL and key pasted
into the in-game Account dialog. Step by step: [docs/guides/supabase.md](../../docs/guides/supabase.md).
