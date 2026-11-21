# Delay Booth: project guide

A personal phone web page that follows NFL games drive by drive, **held back by a user-set delay** so nothing spoils a delayed TV stream (the owner watches the Rams on DAZN). Vanilla JS, no build step, hosted on GitHub Pages from `main`. The owner is a product manager, not a coder: explain in plain words, keep replies short.

## Environments
- **Production:** https://emuen.github.io/delayedgametracker/ (repo root files).
- **Beta:** https://emuen.github.io/delayedgametracker/beta/ (the `beta/` folder; tab title starts "BETA").
- **Simulation:** add `?sim=1&speed=1|2|4|16&from=1..4#g-<eventId>` to either. It replays a finished game as if live; other games in the same window score alongside. 401873057 = JAX at TEN, week 10 (good default, from Q3).

## Workflow (keep it cheap)
0. **Start of a session:** a fresh clone has production in the root and pending work only in `beta/`. If they differ, run `./scripts/from-beta.sh` first to bring the beta's work into the root files.
1. Change the root files.
2. Serve and test: `python3 -m http.server 8765` (from the repo), then `node tests/run.js`. It runs 3 real examples of each of ~118 play types in about 5 s, and diffs info box, chips, banners, labels, caption and hold against `tests/golden.json`. Use `--shots [typeRegex] [--3d]` for a contact sheet in `tests/out/` (about 3 min for all in 3D) only when drawing changed. Look at 1–2 images at most.
3. Publish to beta: `./scripts/beta.sh`, then `git add beta && git commit && git push`. **Commit only `beta/` here**; production keeps the last approved root files.
4. The owner tries it on his phone and replies in batches.
5. **Go live only when the owner says so:** commit the root files, run `node tests/run.js --accept` and commit `tests/golden.json`, then push.

Rules:
- Make small and medium changes directly. Use helper agents only for big batches, and skip separate reviewer passes (tests plus the owner on beta replace them).
- Keep reports to a few lines: what changed, beta link, anything to decide. No recaps. Don't mention the 2D fallback; it is maintained silently.
- ESPN can't be reached from the sandbox. To fetch live data, push a temporary workflow to the `scrape-debug` branch (see git history), read the result, then reset: `git push -f origin main:scrape-debug`.
- `tests/fixtures.json` is built by `tests/build_fixtures.py` from a season dump (outside the repo). Add synthetic cases there for new edge cases.

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
| alerts.js | Other games: dock (ticker) at the user's delay, holding alerts during hot plays (`isBig`, `mainHot`), the calm score card (tap a score for outcome, then top contributors via `scoreStory`), sounds (dong chime, doink, Colts sack-shout easter egg, live only) |
| main.js | Drive replay, tabs, keep-screen-on, startup |

Bump the `?v=` number in index.html for every JS file you change.

## The owner's standing rules
- The main game is the most important thing on screen. Never spoil anything ahead of the delay, other games included.
- The info box is fixed at the top with no pointer. Plain words, **bold key words in the normal text colour**, no coloured result text. Team colours only for team identity.
- Chips in short words: "18 yds", "−5 yd return", "TD, 92 yds", "FLAG DAL, 5 yds", "Fair catch", "Kneel". Use a true minus sign.
- No line of scrimmage, no resting football. Drive start stripe without a flag. Yellow line to gain. Newest play nearest, fixed lane spacing, older plays slide off the far side on long drives.
- Every change of possession gets one look: red mark, the recovering team's colour, a red banner naming it. Defensive scores are in the scoring team's colour. A play wiped out by a penalty animates, then is redrawn as the penalty and doesn't stay.
- Edge-to-edge phone layout, tap targets of 44 px or more. Avoid things moving, inconsistent labels, clutter, and too little time to read.
- Hot plays that hold other-game alerts: 3rd/4th down (not routine punts), turnovers, 20+ yd gains, TDs.
- Teams settings: Follow (default) / Not interested (ticker only) / No spoilers (hidden everywhere). The watched game is never affected.
