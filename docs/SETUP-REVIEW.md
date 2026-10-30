# Setup review: ready for game night

Payton's brief after the polish pass (October 2026): set up the database, make sure hosting and
joining each other's games is safe, that games save like Civ and stay in sync without anyone
noticing, and that the desktop app, sent to friends once, always has the latest version. Keep
the route open for new art later. This page covers what changed, the setup in order, an honest
"is it the best it can be?", and what's next. The guides it points to are in
[guides/](guides/README.md).

## What changed

| Area | Before | Now |
|---|---|---|
| **Seats** | Anyone with the code could take a dropped friend's seat by typing their name | Each friend's seat has a secret key in their browser; only it gets the seat back. The host can **Free seat** for a new device and **Remove** someone from the lobby |
| **Drops** | A dropped friend saw "connection lost" and had to rejoin by hand | Their game reconnects by itself for about three minutes and gets the seat and the whole view back; nothing is sent twice. Dead lines are noticed within seconds; the host's matchmaking line reopens itself |
| **Hosting again** | Always a new code; seats by name | The same code when possible (friends still in the game reconnect without doing anything) and every seat kept for its player |
| **Strict networks** | PeerJS's shared relay only, undocumented | The same, plus your own free relay from repository variables ([online.md](guides/online.md)) |
| **Saves after updates** | Any update (even a balance tweak) made every save, autosave and online game refuse to load | Saves from earlier versions play on with the current rules, like Civ after a patch; only a save that needs missing content (a mod that's off) is refused, and it says what's missing |
| **Cloud** | Manual cloud saves only | Signed in, the autosave goes to the cloud every turn; **Continue** and **Host your online game again** pick the newest from any device |
| **Database** | Rules for who sees what, but no limits | Also: 30 saves of up to 8 MB per player, server-stamped times, one public lobby per host with a server-set expiry, profiles hidden from visitors, trigger functions not callable. Tested against PostgreSQL as two players and an anonymous visitor |
| **Desktop app** | Installers as run attachments (login needed, expire in 90 days); the app was frozen at the version it was built from | A public release with permanent download links; the app opens the live website at every start (the latest game, no reinstall), plays its own copy offline, and runs on Intel and Apple silicon Macs |
| **Staying current** | No way to tell versions apart | The title screen shows the version and offers **A new version is out · Reload**; a friend on another version is told exactly what to do |

The guides were rewritten as step-by-step instructions: [supabase.md](guides/supabase.md),
[online.md](guides/online.md), [desktop.md](guides/desktop.md), and the new
[art.md](guides/art.md).

## The setup, in order (about 45 minutes, most of it waiting)

1. **Merge this update** (it's merged when you read this on `main`), and wait for **Deploy to
   GitHub Pages** to go green.
2. **Supabase** (~20 minutes): [guides/supabase.md](guides/supabase.md), steps 1–6. Run *both*
   SQL files. Use the **anon** key, never the `service_role` key.
3. **Desktop installers** (~15 minutes of waiting): Actions → **Desktop installers** → Run
   workflow. Then install it yourself ([desktop.md](guides/desktop.md), step 2) and send
   friends the message in step 3.
4. **Game night:** host from the app or the website, send the code, play
   ([online.md](guides/online.md)). Friends make their accounts the first night if they want
   cloud saves.
5. **After everyone has an account:** turn sign-ups off ([supabase.md](guides/supabase.md),
   step 7).
6. **Only if a friend can't connect:** set up your own relay ([online.md](guides/online.md),
   "Networks and the relay").

From then on, every merge to `main` reaches everyone (website and desktop app) in about two
minutes, at their next start or reload.

## Is it the best it can be?

For $0 a month and no server to look after, I think it's close to the best this design can be.
What's solid, and where the honest limits are:

- **Safe:** the host checks every action; each friend receives only what their civ can see;
  seats can't be taken over; the database only lets players touch their own data, with limits
  that keep a free project healthy. Limits: a technically skilled *host* could peek through the
  fog with developer tools (they hold the real game), and peer-to-peer play shows players each
  other's IP addresses. Both are normal for friend-hosted games; a paid always-on server would
  remove them (docs/01-architecture.md, "Upgrade path").
- **Saves like Civ:** an autosave every turn, on the device and (signed in) in the cloud,
  continued from anywhere, surviving updates. Limit: if the host's browser storage is wiped and
  they weren't signed in, the online game is gone (as in Civ when the host loses their files):
  hosts should sign in.
- **In sync, unnoticed:** moves show at once and are confirmed by the host; drops heal
  themselves. Limit: if the *host* drops, everyone waits until they host again (there's no host
  handoff yet), and a session needs everyone on the same version (the game says so and how to
  fix it).
- **Always up to date:** one install, every update at the next start. Limits: the installers
  aren't code-signed, so Windows and macOS warn once at install (signing costs $100–400 a year);
  WebRTC in Linux web views isn't guaranteed, so Linux players may need the website for online
  play; and macOS's WebKit is the least tested of the three web views here (I couldn't run
  Windows or macOS from my environment: the builds are checked by GitHub's runners, the app's
  behavior by the same browser tests as the website).
- **What I verified:** 333 automated tests (14 for online play: seat keys, strangers refused,
  freeing seats, reconnecting, a second window, hosting again with keys, removing from the
  lobby), the SQL migrations run twice against PostgreSQL 16 with every rule exercised, the
  scripted two-tab online game in Chromium, a reload-and-rejoin test, a stranger refused in the
  browser, and the desktop launcher both online (opens the live site) and offline (plays its own
  copy).

## What's still missing

- **Host handoff:** another player can't take over hosting; an online game waits for its host.
- **Spectators**, **team chat**, **time banks** and **nudges** (docs/02-multiplayer.md).
- **Code signing** for the installers (costs money each year).
- **A paid relay or dedicated server**, only if the free ones ever fall short.
- The game's own gaps are unchanged ([V1-FINAL-REVIEW.md](V1-FINAL-REVIEW.md#known-gaps)):
  corporations, the Ages mode, crises and the Earth map; and for the art, painted portraits and
  artist-made models ([guides/art.md](guides/art.md)).

## Your next steps

1. **Supabase**, then **Desktop installers**, as above (about 45 minutes in all).
2. **Play a game online with a friend**, from the app or the website, and keep a note of
   anything that looks wrong, reads unclearly, feels slow, or fails. We'll go through it
   together, as you planned.
3. **Art, whenever you like:** painted leader portraits drop in with no code; CC0 model packs I
   can wire in once they're in the repository ([guides/art.md](guides/art.md)).
4. **Optional:** install the Claude GitHub App on the repository so my sessions get CI results
   on their own: https://github.com/apps/claude/installations/select_target.
