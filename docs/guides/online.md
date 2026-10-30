# Playing online together, safely

Online play needs no account, no server and no setup: the host's game runs in their browser
(or desktop app), and friends connect straight to it with a six-character code. This page
explains how that works, what keeps it safe and in sync, and the one optional extra (your own
relay) for friends on strict networks.

## How a game night goes

1. **Host:** title screen → **Play online** → **Host a game**. Pick your name, the map, rivals and
   rules (**More rules** has the turn timer and what happens if a friend drops: wait, or an AI
   plays their seat). **Open the lobby.**
2. Send friends the **code**, or **Copy invite link** (it opens Join with the code filled in).
3. **Friends:** **Play online** → **Join with a code** → their name → **Join**. Everyone picks a
   leader in the lobby (or Random).
4. **Host:** **Start the game** once everyone's in.
5. Everyone plays their turn at the same time; the turn ends when all humans have pressed
   **End turn** (or the timer runs out).
6. **Stopping for the night:** just close the game. The host's game saved itself at the start
   of the turn (and to their account, if signed in). **Next time:** the host opens the game →
   **Host your online game again** → **Host it**; friends join with the code (the same one when
   possible) and get their own seats back.

## What keeps it fair and safe

- **The host's game is the only real one.** Every action a friend sends is checked by the game's
  rules on the host before it counts; a friend can only ever act for their own civ.
- **Each friend only receives what their civ can see.** Fog of war is enforced by what the host
  sends: a friend's browser never holds the rest of the map, other players' plans, or the dice.
  (The host's own browser does hold the real game, so a technically skilled host could peek with
  developer tools. Between friends, that's the trade for $0 a month; the host's screen itself
  shows only their own view.)
- **Seats belong to their players.** When the game starts, each friend's browser gets a secret
  key for their seat. Only that key gets the seat back after a drop: someone else with the code
  can't take your seat by typing your name. The key itself never travels again; the browser
  proves it has it.
- **The host controls who's in.** In the lobby, **Remove** sends someone away (say a stranger
  who found a public game; if they keep coming back, open a new lobby for a new code). In the
  game, the bar at the top shows who's away, with **End their turn** and **Free seat**.
- **Codes:** six letters and digits, about 900 million possibilities, made fresh for each lobby.
  Only list a game publicly (needs [Supabase](supabase.md)) when you want anyone to join.
- **Everyone on the same version.** The host turns away a friend whose game is a different
  version, and says what to do (below). The title screen shows the version at the bottom and
  says **A new version is out · Reload** when there's a newer one.
- **One thing to know:** games connect peer to peer (like most friend-hosted games), so the
  players' computers learn each other's internet (IP) addresses. Play with people you know.

## How it stays in sync

- Every action goes to the host, which answers with the changes each player can see. Your own
  moves show at once (the game plays them ahead on your screen) and the host's answer confirms
  them; combat, ending the turn and deals wait for the host.
- **A dropped connection fixes itself.** If a friend's Wi-Fi blips or their laptop sleeps, their
  game says **Reconnecting to the host…** and tries for about three minutes; the host gives the
  seat back and sends the whole picture again. Nothing they did that the host had confirmed is
  lost, and nothing is applied twice.
- **A friend who closed the game** rejoins with the code from the same browser or desktop app
  they played on. On a different device, the host presses **Free seat** next to their name
  first.
- **If the host drops,** the game pauses for everyone (the host's browser is the game). The host
  opens the game again → **Host your online game again**: friends whose games are still open
  reconnect by themselves if the code could be kept; otherwise send the new code.
- **Updates mid-session:** the website updates whenever `main` changes, but an open game keeps
  running the version it started with, so a session is never disturbed. If someone reloads and
  gets a newer version, the host will say so when they rejoin: everyone reloads, and the host
  picks **Host your online game again**. Saves from before an update keep working.

## Networks and the relay (optional)

Browsers first try to connect directly, which works on almost every home network. Some networks
block that (some school, office or hotel Wi-Fi, some mobile hotspots and carriers). Then the game
falls back to a **relay** (a TURN server) that passes the messages along. Two are possible:

1. **PeerJS's free shared relay**, built in. Nothing to set up, but it's a public service with no
   guarantees.
2. **Your own free relay**, tried first when it's set. Worth doing once if a friend ever can't
   connect (the symptom: they see "The host didn't answer. Check the code." although the code is
   right and the lobby is open). About 10 minutes:
   1. Sign up at [metered.ca](https://www.metered.ca/stun-turn) (the "Open Relay" free plan: about
      20 GB of relayed traffic a month; a whole game night through a relay is a few tens of MB).
   2. In its dashboard, create a TURN app and open **TURN credentials** (or "Show ICE servers").
      Note the server URLs (like `turn:standard.relay.metered.ca:80`, `…:443`,
      `turns:standard.relay.metered.ca:443?transport=tcp`), the **username** and the
      **credential**.
   3. GitHub → **Settings** → **Secrets and variables** → **Actions** → **Variables** → add
      `TURN_URLS` (the URLs, separated by commas), `TURN_USERNAME` and `TURN_CREDENTIAL`.
   4. **Actions** → **Deploy to GitHub Pages** → **Run workflow**. The desktop app opens the
      website, so it uses the relay too.

   The relay's username and credential end up inside the website (browsers need them), so
   someone determined could use your relay allowance. If Metered offers it, restrict the
   credential to your site's domain; if the allowance runs out, the game just falls back to the
   shared relay. Cloudflare's TURN is the paid alternative (about $0.05 per GB).

## Troubleshooting

| You see | What to do |
|---|---|
| "No game with that code is open right now." | Check the code; the host's lobby must be open (the host's game window must stay open). |
| "The host didn't answer. Check the code." | The code is right but the browsers can't connect: try again once; if it keeps happening for one friend, set up your own relay (above), or that friend tries another network (a phone hotspot). |
| "The host is on a different version of the game" / "different game content" | Everyone reloads the page (or restarts the desktop app); the host picks **Host your online game again**. |
| "Every seat in this game is taken. Rejoining from another device…" | The host presses **Free seat** next to your name, then join again with the same name. |
| "Reconnecting to the host…" for a long time | The host's game closed or lost its connection: wait for the host to host again, then join with the code. |
| "Couldn't reach the matchmaking service" | PeerJS's free broker (which only introduces players) didn't answer: wait a minute and try again. |
| Online play doesn't connect in the Linux desktop app | Some Linux web views have no WebRTC: play online from the website in a browser. |
