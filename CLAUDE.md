# Delay Booth: project guide

A personal phone web page that follows NFL games drive by drive, **held back by a user-set delay** so nothing spoils a delayed TV stream (the owner watches the Rams on DAZN). Vanilla JS, no build step, hosted on GitHub Pages from `main`. The owner is a product manager, not a coder: explain in plain words, keep replies short.

## Environments
- **Production:** https://emuen.github.io/delayedgametracker/ (repo root files).
- **Beta:** https://emuen.github.io/delayedgametracker/beta/ (the `beta/` folder; tab title starts "BETA").
- **Lab:** https://emuen.github.io/delayedgametracker/lab/ (the `lab/` folder; tab title starts "LAB"). A throwaway copy of beta for wilder experiments (started 26 Nov 2026 with the drive card). Work in `lab/` directly; `./scripts/lab.sh` resets it to the current beta. Keep beta to fixes and small things while an experiment runs, copy beta fixes into the lab when they matter there, and keep experiments short. If the owner keeps an experiment, it becomes the next beta (with beta's fixes copied in); if not, delete `lab/`.
- **Simulation:** add `?sim=1&speed=1|2|4|16&from=1..4#g-<eventId>` to either. It replays a finished game as if live; other games in the same window score alongside. 401873057 = JAX at TEN, week 10 (good default, from Q3).

## Workflow (keep it cheap)
0. **Always build on the latest `beta/`** (another session may have pushed since): pull first, then run `./scripts/from-beta.sh` before changing anything, or `beta.sh` will overwrite newer beta work.
0. **Start of a session:** a fresh clone has production in the root and pending work only in `beta/`. If they differ, run `./scripts/from-beta.sh` first to bring the beta's work into the root files.
1. Change the root files.
2. Serve and test: `python3 -m http.server 8765` (from the repo), then `node tests/run.js`. It runs 3 real examples of each of ~118 play types in about 5 s, and diffs info box, chips, banners, labels, caption and hold against `tests/golden.json`. Use `--shots [typeRegex] [--3d]` for a contact sheet in `tests/out/` (about 3 min for all in 3D) only when drawing changed. Look at 1–2 images at most.
2b. **UI check** (any change to layout, CSS or markup): `node tests/ui.js` (about 25 s). It shows the key screens at phone size in light and dark from sample data, writes one contact sheet `tests/out/ui.png`, and prints flags. Fix every flag, then look at the sheet once against the UI checklist below.
3. Publish to beta: `./scripts/beta.sh`, then `git add beta && git commit && git push`. **Commit only `beta/` here**; production keeps the last approved root files.
4. The owner tries it on his phone and replies in batches.
5. **Go live only when the owner says so:** commit the root files, run `node tests/run.js --accept` and commit `tests/golden.json`, then push.

Rules:
- Make small and medium changes directly. Use helper agents only for big batches, and skip separate reviewer passes (tests plus the owner on beta replace them).
- Keep reports to a few lines: what changed, beta link, anything to decide. No recaps. Don't mention the 2D fallback; it is maintained silently.
- ESPN can't be reached from the sandbox. To fetch live data, push a temporary workflow to the `scrape-debug` branch (see git history), read the result, then reset: `git push -f origin main:scrape-debug`.
- `tests/fixtures.json` is built by `tests/build_fixtures.py` from a season dump (outside the repo). Add synthetic cases there for new edge cases.

## Visual style: "Ballpark × Station" (chosen Nov 2026, on beta)
- Feel: the old hand-hung ballpark scoreboard (big number plates, heavy condensed type, chunky tiles) in clean station colours. No browns. The teams bring the colour; the frame stays neutral.
- Light tokens: bg #f3f2ee, surface #fff, line #d9d7d1, ink #161616, muted #615f59, plate #1b1b1b / plate ink #f6f4ee, signal yellow #f2c230 (accent: ball tab, line to gain only). Corners `--r` 10px, `--rs` 6px. Red only for change of possession.
- Type: Big Shoulders Display (`--display`, numbers and labels) + Work Sans (`--body`).
- Score header: team badge above a compact score plate (64 px), "BALL" tab on the plate edge of the team with the ball, clock in the middle; no down & distance (the info box covers it). Delay chip top right; status line only when something is wrong; game info at the bottom of Stats; underline tabs; outlined Replay. Game list: team logos, "Your game" pinned on top, delayed clock on live games, nicknames, no network, 24 h times; week picker is a sheet of number plates with each week's span of games.
- Dark mode "Blue-hour slate" (Round 5, N3): bg #1e232a, surface #2a3039, line #343b46, ink #eef1f4, muted #a4acb6, signal #e9bc34, red #ee6352; score plates outlined only (`--plate-border`), corners 14/8 px; dark sky and turf in the charts, dark info box (drivecore `DKM`). Dark team colours fall back to the team's own colour with a light edge on the header badges.
- Mood boards and mockups: https://claude.ai/artifact/CdXPvVJpsvVkVCwrWTX7ob (Round 4 light, Round 5 dark).

## UI checklist (every UI change)
- New controls get their look from the base layer at the top of the CSS (no native arrows, boxes or tap flashes); never leave a browser default.
- Nothing wider than the screen; at least 8 px between any control and the screen edge (charts, dock and overlays run edge to edge on purpose).
- Tap targets 44 px or more (a label around a switch counts).
- Text never cut off without an ellipsis; long team names use the nickname.
- Check both light and dark, and every sheet that opens over the page (the page behind must not scroll).
- Reuse the tokens (`--r`, `--rs`, colours, `--display`/`--body`); no one-off colours or corners.

## Code map
`index.html` holds the markup and CSS. Classic scripts load in this order and share globals:

| File | What |
|---|---|
| drivecore.js | Shared by both charts: timing plan, chips (`chipFor`), banners (`overlayState`), yardage format (`ydStr`), FG paths, doink watch |
| chart2d.js / chart3d.js | Renderers with the same API: `render(spec)` still image, `replay(holder,spec,opts)`, `hits(spec)`. 3D (three.js r128 from cdnjs) is the default; 2D is the automatic fallback |
| core.js | State `S`, settings, simulation, polling, broadcast crews |
| feed.js | ESPN feed reading: teams and colours, drive results (`endOf`, `resultLabel`), field positions, kicks, blocks, fumbles, `latestDrive()` |
| render.js | Game view rendering, drive list, `playKind`, chart choice |
| chartspec.js | `fieldChart3D(L,specOnly)`: a drive into a renderer spec, plus all info-box text (`condense`, `calloutOf`) and the change-of-possession, defensive score, try note rules |
| stats.js | Game info and stats tabs |
| games.js | Game list, routing (`#g-<id>`, `#w-...`), settings, teams sheet |
| live.js | Live animation of each new play (heads-up `S.lead`, snap, reveal at `playTime + delay`) |
| alerts.js | Other games: dock (ticker) at the user's delay, holding alerts while a play is under way (`mainHot`), score lines (a scoring chip shows "TD · J.Gibbs, 12 yds" for 10 s and scrolls into view; tap a chip for the scoring-drive replay with outcome and top contributors via `scoreStory` underneath), sounds (dong chime, doink, Colts sack-shout easter egg, live only) |
| drivecard.js | The drive card: summary line, still picture, Replay/Stop, stepping (buttons, swipe, lane tap) |
| main.js | Drive list taps, tabs, keep-screen-on, startup |
| players.js | Player photos (`Players`): `players.json` (nflverse rosters, refreshed daily by `.github/workflows/players.yml` → `scripts/players.py`, keyed by ESPN id), `find`/`byId`, preloading (`warm` on entering a game: skill players, K, defence, OL, P/LS; `preload` for a scoring chip's faces), `imgOf` for the chart (CORS) and `face()` HTML. One image size (160 px) everywhere. |

Bump the `?v=` number in index.html for every JS file you change.

## The drive card (drivecard.js)
The drive chart with its summary line, info box and controls is one component, used by the game view (`renderDrives`) and the ticker sheet (`dongOpen`). **It behaves the same everywhere: a place may change how it opens and what sits around it, never what you can do with it.** Both open on the still picture. Controls: Replay drive / Stop; step through plays with ◀ ▶ (counter "Play 3 of 8", kickoffs and punts named), a sideways swipe on the chart, or a tap on a lane; "Whole drive" goes back. Place options are limited to `onBusy` (the game view pauses its updates and the live animation while the card is busy); a new option needs the owner's OK. New chart features go into the card, never into a place. The ticker's title, score line and top contributors belong to the ticker sheet, outside the card. `tests/ui.js` flags it if the two places' cards offer different controls.

## Data: the page owns correct labels
ESPN is the raw source, but the page is responsible for labelling every play and drive correctly, so it may correct or decide things ahead of ESPN when the plays themselves show the answer (owner's call, 26 Nov 2026). Current corrections, all in feed.js: failed 4th downs decided from the play before ESPN updates (`endOf`, with `penaltyKeepsResult` and `textGain`); the page's own drive result wins over ESPN's "Unknown" (`driveState`); play end spots that disagree with the yards gained are redrawn from the yards, and offensive touchdowns end at the goal line (`latestDrive`). Rules: correct only from evidence in ESPN's own data (play text, downs, yards), never from guesses; when nothing can be decided, show what ESPN says, "Unknown" included; add each new correction to this list.

## Player photos ("Card" design, live 27 Nov 2026)
- Info box: number plates only. To its right, Card photos of the players named in the text on screen (never ahead of it), in naming order: team-colour frame, number on a tab over the bottom edge, silhouette when there's no photo. The box keeps one size on every play, always leaving room for 2 cards; a 3rd shares that room.
- The ticker's top contributors show the same Card faces (`Players.face`).
- Photos are the NFL's own headshot URLs (static.www.nfl.com allows CORS); nothing is stored in the repo. A new image size is slow the first time anyone asks (~0.8 s), so keep the one size.

## The owner's standing rules
- The main game is the most important thing on screen. Never spoil anything ahead of the delay, other games included.
- The info box is fixed at the top with no pointer. Plain words, **bold key words in the normal text colour**, no coloured result text. Team colours only for team identity.
- Chips in short words: "18 yds", "−5 yd return", "TD, 92 yds", "FLAG DAL, 5 yds", "Fair catch", "Kneel". Use a true minus sign.
- No line of scrimmage, no resting football. Drive start stripe without a flag. Yellow line to gain. Newest play nearest, fixed lane spacing, older plays slide off the far side on long drives.
- Every change of possession gets one look: red mark, the recovering team's colour, a red banner naming it. Defensive scores are in the scoring team's colour. A play wiped out by a penalty animates, then is redrawn as the penalty and doesn't stay.
- Edge-to-edge phone layout, tap targets of 44 px or more. Avoid things moving, inconsistent labels, clutter, and too little time to read.
- Other-game alerts wait silently only while a play in the main game is under way (snap to settled result), then come out between plays. No "waiting" indicator.
- Teams settings: Follow (default) / Not interested (ticker only) / No spoilers (hidden everywhere). The watched game is never affected.
