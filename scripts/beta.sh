#!/bin/sh
# Copy the working-tree site into beta/ (served at /beta/). Shared files (crews.json, gdd.mp3) are read from the live root.
set -e
cd "$(dirname "$0")/.."
rm -rf beta && mkdir -p beta
for f in *.js; do
  sed -e 's#fetch("crews.json#fetch("../crews.json#' -e 's#fetch("gdd.mp3")#fetch("../gdd.mp3")#' -e 's#fetch("icecream.mp3")#fetch("../icecream.mp3")#' "$f" > "beta/$f"
done
sed -e 's#<title>\([^<]*\)</title>#<title>BETA · \1</title>#' index.html > beta/index.html
echo "beta/ updated"
