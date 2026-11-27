#!/usr/bin/env python3
"""Fetch this season's NFL rosters from the open nflverse dataset and write players.json,
which the tracker page reads for headshots, jersey numbers and positions.

Runs in GitHub Actions. Standard library only. Set ROSTER_CSV=path to parse a saved
file instead of fetching (for testing). Images are not downloaded: the page shows
the NFL's own headshot URL directly."""
import csv, datetime, io, json, os, urllib.request

_today = datetime.date.today()
SEASON = int(os.environ.get("SEASON") or (_today.year if _today.month >= 3 else _today.year - 1))   # Jan-Feb belong to last season
URL = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_%d.csv" % SEASON
IMG = "https://static.www.nfl.com/image/"          # common prefix, stripped to keep the file small
TEAM = {"LA": "LAR", "WAS": "WSH"}                 # nflverse code -> ESPN code (the rest match)
SKIP = {"RET"}                                     # retired players never show up in a game

def load():
    path = os.environ.get("ROSTER_CSV")
    if path:
        return open(path, encoding="utf-8").read()
    with urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "delayedgametracker"}), timeout=60) as r:
        return r.read().decode("utf-8")

def main():
    rows = list(csv.DictReader(io.StringIO(load())))
    out = {}
    for x in rows:
        if x.get("status") in SKIP or not x.get("gsis_id"):
            continue
        first = (x.get("football_name") or x.get("first_name") or "").strip()
        last = (x.get("last_name") or "").strip()
        img = (x.get("headshot_url") or "").strip()
        p = {
            "gsis": x["gsis_id"],
            "name": x.get("full_name") or (first + " " + last).strip(),
            "short": (first[:1] + "." + last) if first and last else "",   # "D.Achane", as in ESPN play text
            "team": TEAM.get(x.get("team"), x.get("team") or ""),
            "pos": x.get("position") or "",
            "num": x.get("jersey_number") or "",
        }
        if img:
            p["img"] = img[len(IMG):] if img.startswith(IMG) else img
        key = x.get("espn_id") or ("g" + x["gsis_id"])   # ESPN id when known (what the feed uses), else gsis
        out[key] = p
    # One player per line, so a daily change shows up as a small, readable diff.
    lines = ",\n".join(json.dumps(k) + ":" + json.dumps(out[k], separators=(",", ":"), ensure_ascii=False, sort_keys=True) for k in sorted(out))
    with open("players.json", "w", encoding="utf-8") as f:
        f.write('{"source":"nflverse","season":%d,"players":{\n%s\n}}\n' % (SEASON, lines))
    print("players.json: %d players, season %d" % (len(out), SEASON))

if __name__ == "__main__":
    main()
