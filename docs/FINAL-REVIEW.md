# Final quick review

Dependencies were missing at start; `pnpm install --frozen-lockfile` fixed it. No other setup changes.

## Checked
- `pnpm lint`, `format:check`, `typecheck`, `test` (56 files, 423 tests, includes online and host tests) and `pnpm build`: all pass.
- Soak (all-AI): `simulate 4 150 11 small`, `6 150 12 standard`, `4 100 13 small --afk`, `8 100 14 large`: all finished, no errors or invalid states. Average AI turn 116 to 182 ms, slowest 1.8 s. `cx validate` clean.
- Text scan: no TODO/FIXME/lorem/`[object`/NaN or raw ids in visible content; no double spaces or a/an slips in content. Plural templates checked in the visible places (`soldier(s)` handled; the others use fixed counts from rules).
- Online: seat keys are checked by proof (`seatProof` against held proofs), names are cut to 24 chars and chat to 300 (host side as well as the inputs), no `dangerouslySetInnerHTML`, so React escapes names and chat. The client code refuses the secret key (`sb_secret_`/`service_role`); no secret key found in the client.
- `pnpm audit --prod`: no known vulnerabilities.
- Settings: defaults are quality medium, 3D view, autosave on, sound unmuted; storage reads and writes (settings and audio) are in try/catch.
- Audio: cues exist for war, peace, deal, wonder, great person, era, victory, defeat, religion, turn and more.

## Fixed
- A refused action now plays the existing `error` cue (it was defined but never played) in `GameScreen.tsx`.

## Could not verify (checklist for you)
- [ ] Sound by ear: volume levels, mute and sliders persisting after a reload, music per era.
- [ ] Real phones and other browsers (Safari, Firefox), including 3D performance.
- [ ] Online over a real network (two devices, drop and rejoin); a real Supabase project and sign-in.
- [ ] Visuals (no screenshots were taken).

## Follow-ups
- AI makes many refused `move_unit:no_path` orders (about 1600 in a 6-player 150-turn game); harmless, but worth a look.
- Historic names kept as real-world history, not Civ-specific: Pyramids, Stonehenge, Colossus, Oracle, Hanging Gardens, Cleopatra, Montezuma, Pericles, Byzantium. Borderline only if you want fully invented names.
- Mentions of Civilization in `docs/` are design notes, not game text; I left them.
- Quick-game sound and hints defaults were not read in detail (hints live in `game/hints.ts`).

## Taste calls
- FPS counter is on by default (`showFps: true`). Recommended: off for new players.
- Whether to rename the real-history wonders and leaders above. Recommended: keep.
