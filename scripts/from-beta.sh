#!/bin/sh
# Start of a session: bring the beta's pending work back into the root working files (the reverse of beta.sh).
# Production stays as committed; nothing is committed here.
set -e
cd "$(dirname "$0")/.."
for f in beta/*.js; do
  sed -e 's#fetch("\.\./crews.json#fetch("crews.json#' -e 's#fetch("\.\./gdd.mp3")#fetch("gdd.mp3")#' -e 's#fetch("\.\./icecream.mp3")#fetch("icecream.mp3")#' "$f" > "$(basename "$f")"
done
sed -e 's#<title>BETA · \([^<]*\)</title>#<title>\1</title>#' beta/index.html > index.html
echo "root working files now match beta/ (uncommitted)"
