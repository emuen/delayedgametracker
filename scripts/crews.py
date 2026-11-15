#!/usr/bin/env python3
"""Fetch NFL broadcast crews for the current and next week from 506sports.com
and write them to crews.json, which the tracker page reads.

Runs in GitHub Actions. Standard library only. Set CREWS_HTML=path to parse a
saved page instead of fetching (for testing)."""
import datetime, html, json, os, re, sys, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
TEAMS = {
    "arizona": "ARI", "atlanta": "ATL", "baltimore": "BAL", "buffalo": "BUF", "carolina": "CAR",
    "chicago": "CHI", "cincinnati": "CIN", "cleveland": "CLE", "dallas": "DAL", "denver": "DEN",
    "detroit": "DET", "green bay": "GB", "houston": "HOU", "indianapolis": "IND", "jacksonville": "JAX",
    "kansas city": "KC", "las vegas": "LV", "la chargers": "LAC", "l.a. chargers": "LAC",
    "los angeles chargers": "LAC", "la rams": "LAR", "l.a. rams": "LAR", "los angeles rams": "LAR",
    "miami": "MIA", "minnesota": "MIN", "new england": "NE", "new orleans": "NO", "ny giants": "NYG",
    "n.y. giants": "NYG", "new york giants": "NYG", "ny jets": "NYJ", "n.y. jets": "NYJ",
    "new york jets": "NYJ", "philadelphia": "PHI", "pittsburgh": "PIT", "san francisco": "SF",
    "seattle": "SEA", "tampa bay": "TB", "tennessee": "TEN", "washington": "WSH",
}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

def team(name):
    n = re.sub(r"\(.*?\)", "", name).strip().lower()
    return TEAMS.get(n)

def parse(page, season, week):
    page = re.sub(r"<!--.*?-->|<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    token = re.compile(
        r'<font size="5">(?P<head>.*?)</font>'
        r'|<div id="cgame">\s*<div id="cmatchup">(?P<cm>.*?)</div>\s*<div id="ctime">(?P<ct>.*?)</div>\s*'
        r'<div id="cntwk">(?P<cn>.*?)</div>\s*<div id="canncrs">(?P<ca>.*?)</div>\s*</div>'
        r"|<div id='game'>.*?<div id='matchup'>(?P<gm>.*?)</div>\s*<div id='anncrs'>(?P<ga>.*?)</div>\s*</div>",
        re.S)
    section, games, seen = "", [], set()
    for m in token.finditer(page):
        if m.group("head"):
            section = text(m.group("head"))
            continue
        if m.group("cm") is not None:
            match, crew, network, slot = m.group("cm"), m.group("ca"), text(m.group("cn")), text(m.group("ct"))
        else:
            match, crew = m.group("gm"), m.group("ga")
            parts = section.split()
            network, slot = (parts[0] if parts else ""), " ".join(parts[1:]).title()
            if "(LATE)" in match.upper():
                slot = "Late"
        names = re.split(r"\s+(?:@|vs\.?|at)\s+", text(re.sub(r"<i>.*?</i>", "", match)), maxsplit=1)
        if len(names) != 2:
            continue
        away, home = team(names[0]), team(names[1])
        if not away or not home:
            continue
        key = (away, home)
        if key in seen:  # first listing wins: the national or main broadcast
            continue
        seen.add(key)
        main, _, note = crew.partition("<br")
        people = [p.strip() for p in re.split(r",|\band\b|/", text(main)) if p.strip()]
        games.append({
            "season": season, "week": week, "away": away, "home": home,
            "network": network.replace("FOX", "FOX").strip(), "slot": slot,
            "crew": people, "note": text("<br" + note) if note else "",
        })
    return games

def main():
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "crews.json")
    if os.environ.get("CREWS_HTML"):
        games = parse(open(os.environ["CREWS_HTML"], encoding="utf-8", errors="replace").read(),
                      int(os.environ.get("CREWS_YR", 0)), int(os.environ.get("CREWS_WK", 0)))
        print(json.dumps(games, indent=1))
        return
    sb = json.loads(get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"))
    season, week = int(sb["season"]["year"]), int(sb["week"]["number"])
    games = []
    for wk in (week, week + 1):
        try:
            games += parse(get("https://506sports.com/nfl.php?yr=%d&wk=%d" % (season, wk)), season, wk)
        except Exception as e:  # next week may not be posted yet
            print("week %d: %s" % (wk, e), file=sys.stderr)
    if not games:
        print("No games parsed; keeping the old file.", file=sys.stderr)
        sys.exit(0)
    data = {"source": "506sports.com", "season": season, "week": week, "games": games}
    old = None
    try:
        old = json.load(open(out_path))
    except Exception:
        pass
    if old and {k: v for k, v in old.items() if k != "updated"} == data:
        print("No change.")
        return
    data["updated"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(data, open(out_path, "w"), indent=1)
    print("Wrote %d games." % len(games))

if __name__ == "__main__":
    main()
