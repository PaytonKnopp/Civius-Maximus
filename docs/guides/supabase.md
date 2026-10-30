# Accounts, cloud saves and public games (Supabase)

The game has accounts, cloud saves and a public games list built in. They switch on when the
game knows a Supabase project. Supabase's free tier is plenty for a group of friends, and this
guide sets it up safely in about 20 minutes.

**What you get:**

- **Accounts:** a username and a password, remembered on each device.
- **Cloud saves:** Save / Load → **Save to the cloud**, and an **automatic cloud save every
  turn**. **Continue** on the title screen picks the newest of this device's autosave and the
  cloud's, so a game goes on from any device: the website, the desktop app, a laptop, a phone.
- **Public games:** a host can list their lobby so friends find it under **Join** without being
  sent the code.

**What it doesn't change:** live play still goes straight from browser to browser, so Supabase
never carries the moves. Without an account everything else works the same (saves stay on that
device).

## 1. Create the project (3 minutes)

1. Go to [supabase.com](https://supabase.com) → **Start your project**, and sign in with
   GitHub.
2. **New project.** Organization: your personal one (Free plan). Name: `civius-maximus`.
   **Database password:** click **Generate a password** and save it in your password manager
   (the game never needs it; it's for you, in an emergency). **Region:** the one closest to you
   and your friends (e.g. East US). Keep the security options as they come (Data API on, the
   `public` schema exposed).
3. **Create new project.** Wait a minute or two until the dashboard says it's healthy.

## 2. Create the tables and the safety rules (3 minutes)

1. Left sidebar → **SQL Editor** → **New query** (the + tab).
2. Open
   [`packages/backend/supabase/migrations/0001_accounts_saves_lobbies.sql`](../../packages/backend/supabase/migrations/0001_accounts_saves_lobbies.sql)
   on GitHub, click **Raw**, select all, copy, paste into the editor, and click **Run**. You
   should see **Success. No rows returned**. (Supabase may warn that the query has destructive
   operations: that's the `drop policy if exists` lines that make it safe to run again. Confirm.)
3. New query again, and the same for
   [`0002_limits_and_safety.sql`](../../packages/backend/supabase/migrations/0002_limits_and_safety.sql).
4. Check: left sidebar → **Table Editor** shows `lobbies`, `profiles` and `saves`, each with a
   **RLS enabled** badge (no "RLS disabled" warning).

What the rules do:

| Table | Who can read | Who can change |
|---|---|---|
| `profiles` | Signed-in players | Only the player it belongs to |
| `saves` | Only their owner | Only their owner; at most 30 saves of up to 8 MB each per player; the server stamps the time |
| `lobbies` | Anyone (only lobbies that haven't expired) | Only their host; one lobby per host; the server sets the six-hour expiry |

Run both files again whenever this guide says a new migration was added (they're safe to
re-run, and later ones build on earlier ones).

## 3. Accounts with just a username (2 minutes)

The game signs players up with a private placeholder address (`name@players.civiusmaximus.invalid`)
unless they type a real email, so confirmation emails can't be delivered.

1. Left sidebar → **Authentication** → **Sign In / Providers** (older dashboards: **Providers**
   → **Email**).
2. Keep **Email** enabled. Turn **Confirm email** **off**. Save.
3. Same page (or **Authentication** → **Policies/Settings**, depending on the dashboard):
   **Minimum password length: 8** (the game asks for 8 too). If your plan shows **Prevent use of
   leaked passwords**, turn it on.

## 4. Copy the two values the game needs (1 minute)

Left sidebar → **Project Settings** (gear) → **Data API** (or **API Keys**):

- **Project URL**, like `https://abcdefghijkl.supabase.co`
- the **anon public** key: a long string starting `eyJ`. Newer dashboards put it under
  **API Keys** → **Legacy API Keys**. (The newer "publishable" key, `sb_publishable_…`, is meant
  to work the same way, but the game is tested with the anon key: use that one.)

**Never use the `service_role` / `secret` key anywhere in the game, in GitHub, or in a chat.** It
skips every rule from step 2. If it ever leaks, roll it in the same settings page.

The anon key is meant to be public: it's inside the website for anyone to see, and what it can
do is limited by the rules from step 2.

## 5. Tell the game (3 minutes)

1. GitHub → your repository → **Settings** → **Secrets and variables** → **Actions** → the
   **Variables** tab (not Secrets: the website needs to read them) → **New repository variable**:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_ANON_KEY` = the anon key
2. **Actions** → **Deploy to GitHub Pages** → **Run workflow** → **Run workflow** (or merge
   anything to `main`). When it's green (about 2 minutes), the website has **Account** with
   sign-in.
3. The desktop app opens the website, so it gets accounts too, with nothing to rebuild.

Other ways, for testing: in the game **Account** → paste the URL and key → **Connect** (that
browser only); or, running the game locally, copy `packages/client/.env.example` to
`packages/client/.env.local` and fill them in.

## 6. Try it (5 minutes)

1. Title screen → **Account** → **Create an account** (a username of 3–20 letters, digits or
   underscores, and a password of 8+ characters). The footer now says your game saves "here and
   to your account".
2. **Quick game**, play two turns. Supabase → **Table Editor** → `saves`: there's an `autosave`
   row. (You see everyone's rows here because the dashboard is the owner; players only ever see
   their own.)
3. On another device or browser, open the game, sign in: **Continue** offers the same game.
4. **Play online** → **Host a game** → tick **List this game publicly**. On another device,
   **Join** shows it under **Public games**.

## 7. Lock it down once your friends have accounts (2 minutes)

Anyone who finds the website can create an account while sign-ups are open. Once your group has
theirs:

1. **Authentication** → **Sign In / Providers** → turn **Allow new users to sign up** off. Save.
2. Someone new later? Either switch it on for a few minutes, or create them yourself:
   **Authentication** → **Users** → **Add user** → **Create new user**, email
   `theirname@players.civiusmaximus.invalid` (their username, lowercase), a password, **Auto
   Confirm User** on. They sign in with the username and that password.

Accounts aren't needed to play online together (join codes work without them), so this costs
nothing but strangers' sign-ups.

## 8. Keeping it awake and healthy

- **Pausing:** free projects pause after a week without use. Once the repository variables
  exist, the **Keep Supabase awake** workflow asks the database a tiny question every three
  days. If a project paused anyway: open it in Supabase → **Restore project** (a minute or two;
  nothing is lost).
- **Space:** the free database is 500 MB. A save is 0.3–2 MB, and each player keeps at most 30,
  so a group of eight stays well under it. **Project Settings** → **Usage** shows where you are.
- **Backups:** the free plan has no point-in-time backups. Saves also stay on each device, and
  **Export file** in Save / Load keeps a copy of any game you care about.
- **Security Advisor:** **Advisors** → **Security Advisor** should show no errors (a warning
  about leaked-password protection is expected on the free plan).

## Troubleshooting

| You see | Fix |
|---|---|
| "Email not confirmed" | Step 3: turn **Confirm email** off. |
| "Invalid login credentials" | Wrong username or password (usernames aren't case-sensitive). |
| "Signups not allowed for this instance" | Step 7 turned sign-ups off: create the account yourself, or turn them on briefly. |
| "new row violates row-level security" | Sign in again; or step 2 didn't run. |
| "You have 30 cloud saves already" | Save / Load → delete an old cloud save. |
| "The cloud said no (401)" | The key is wrong or is the `service_role` key; use the anon key. |
| No **Account** sign-in on the website | The variables in step 5 are missing (or are Secrets instead of Variables), or the site hasn't been rebuilt since. |
| **Continue** doesn't offer the other device's game | Sign in on both; the cloud autosave is made at the start of each turn, so play one more turn on the first device. |
