# Accounts, cloud saves and public games (Supabase)

The game has accounts, cloud saves and a public games list built in; they switch on when the
game knows a Supabase project. Supabase's free tier is plenty for a group of friends.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com), sign in (GitHub works) and click **New project**.
2. Pick any name (e.g. `civius-maximus`), set a database password (keep it somewhere; the game
   doesn't need it), and choose the region closest to you. Click **Create new project** and wait
   a minute or two.

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Open [`packages/backend/supabase/migrations/0001_accounts_saves_lobbies.sql`](../../packages/backend/supabase/migrations/0001_accounts_saves_lobbies.sql),
   copy all of it, paste it into the editor and click **Run**. You should see "Success. No rows
   returned". (It's safe to run again later.)

This creates three tables (profiles, saves, lobbies) with row-level security: every player can
only read and change their own saves, and a public lobby can only be changed by its host.

## 3. Let players sign up with just a username

The game signs players up with a private placeholder address (`name@players.civiusmaximus.invalid`)
unless they type a real email, so confirmation emails can't be delivered.

1. Open **Authentication** → **Sign In / Providers** (or **Providers**) → **Email**.
2. Keep **Email** enabled, turn **Confirm email** off, and save.

(Players who sign up with a real email can still reset their password from Supabase later.)

## 4. Copy the two values the game needs

Open **Project Settings** → **Data API** (or **API**) and copy:

- **Project URL**, like `https://abcdefghijkl.supabase.co`
- the **anon public** key (a long `eyJ…` string; *not* the `service_role` key, which must stay
  secret)

The anon key is meant to be public: what players can do with it is limited by the row-level
security from step 2.

## 5. Tell the game

Pick one (or several):

- **For everyone, on the website:** in GitHub, open the repository → **Settings** → **Secrets
  and variables** → **Actions** → the **Variables** tab → **New repository variable**. Add
  `SUPABASE_URL` (the Project URL) and `SUPABASE_ANON_KEY` (the anon key). Then run
  **Actions** → **Deploy to GitHub Pages** → **Run workflow** (or push anything to `main`). The
  site now shows **Account** with sign-in.
- **Just in your browser, right now:** in the game, **☰** → **Account…** → paste the URL and the
  key → **Connect**. It's remembered in that browser only.
- **When running the game locally:** copy `packages/client/.env.example` to
  `packages/client/.env.local` and fill in the two values.

The desktop app build ([desktop.md](desktop.md)) uses the same repository variables.

## 6. Try it

1. **Account** → **Create an account** (a username and a password of 8+ characters).
2. **☰** → **Save / Load** → **Save to the cloud**. Open the game on another device, sign in, and
   the save is there.
3. **Play online** → **Host a game** → tick **List this game publicly**. Friends see it under
   **Join with a code** → **Public games**, without you sending the code.

## 7. Keeping it awake

Free projects pause after a week without use. Once the repository variables exist, the **Keep
Supabase awake** workflow asks the database a tiny question every three days, so it stays on
between game nights. If a project paused anyway, open it in Supabase and click **Restore**.

## Troubleshooting

| You see | Fix |
|---|---|
| "Email not confirmed" | Step 3: turn **Confirm email** off. |
| "Invalid login credentials" | Wrong username or password (usernames aren't case-sensitive). |
| "new row violates row-level security" | Sign in again; or the SQL in step 2 didn't run. |
| "The cloud said no (401)" | The key is wrong or is the `service_role` key; use the anon key. |
| No **Account** sign-in on the website | The variables in step 5 are missing, or the site hasn't been rebuilt since. |
