#!/bin/sh
# Start (or restart) the lab: a throwaway copy of the current beta/ at /lab/ for wilder experiments.
# Overwrites lab/. Afterwards, lab work happens directly in lab/ (see the project guide).
set -e
cd "$(dirname "$0")/.."
rm -rf lab && mkdir -p lab
cp beta/*.js lab/
sed -e 's#<title>BETA · \([^<]*\)</title>#<title>LAB · \1</title>#' beta/index.html > lab/index.html
echo "lab/ is now a copy of beta/"
