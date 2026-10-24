#!/bin/bash
# ATLAS Observer: source staging only. No Docker, tunnel, plugin, service or power changes.
set -euo pipefail
umask 077
COMMIT='1053f4251c7d092e9f1afbe709b89bcb27dea096'
REPO='mikeyrnewton-pixel/newton-revenue-site'
STAGE="$HOME/ATLAS-OBSERVER-MCP-REVIEW-20261024"
NODE="$HOME/ATLAS-LOCAL-SETUP/node/bin/node"
if [ "$(uname -s)" != Darwin ] || [ "$(id -u)" = 0 ]; then
  echo 'HOLD: Mac owner session required'; exit 2
fi
if ! pmset -g batt | grep -q "Now drawing from 'AC Power'"; then
  echo 'HOLD: AC power required'; exit 2
fi
if [ -e "$STAGE" ] || [ -L "$STAGE" ]; then
  echo 'HOLD: Stage directory already exists; no overwrite'; exit 2
fi
if [ ! -x "$NODE" ] || ! command -v git >/dev/null || ! command -v curl >/dev/null; then
  echo 'HOLD: Node, git, or curl not available'; exit 2
fi
TMP="$(mktemp -d "$HOME/.atlas-observer-stage.XXXXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/scripts" "$TMP/tests"
while IFS='|' read -r FILE SHA; do
  [ -n "$FILE" ] || continue
  URL="https://raw.githubusercontent.com/$REPO/$COMMIT/$FILE"
  if ! curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location --silent --show-error \
     --connect-timeout 10 --max-time 45 --output "$TMP/$FILE" "$URL"; then
    echo "HOLD: Pinned source download failed: $FILE"; exit 2
  fi
  if [ ! -s "$TMP/$FILE" ] || [ "$(git hash-object "$TMP/$FILE")" != "$SHA" ]; then
    echo "HOLD: Integrity mismatch: $FILE"; exit 2
  fi
  chmod 600 "$TMP/$FILE"
  echo "SOURCE_VERIFIED=$FILE"
done <<'VERIFIED_SOURCES'
scripts/atlas-mcp-observer.mjs|56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5
scripts/atlas-observer-snapshot.mjs|7dde06ee91ce6776c6e6217e4dd43c402f678d79
tests/atlas-mcp-observer.test.mjs|0b43927fbe6843d05a6241785b83ed8d55b1b804
VERIFIED_SOURCES
"$NODE" --check "$TMP/scripts/atlas-mcp-observer.mjs"
"$NODE" --check "$TMP/scripts/atlas-observer-snapshot.mjs"
"$NODE" --check "$TMP/tests/atlas-mcp-observer.test.mjs"
if ! "$NODE" --test "$TMP/tests/atlas-mcp-observer.test.mjs" > "$TMP/test-results.log" 2>&1; then
  echo 'HOLD: Offline tests failed (last lines):'
  tail -n 15 "$TMP/test-results.log"
  exit 2
fi
echo '=== OFFLINE TEST RESULTS ==='
tail -n 10 "$TMP/test-results.log"
rm -f "$TMP/test-results.log"
if [ -e "$STAGE" ] || [ -L "$STAGE" ]; then
  echo 'HOLD: Stage directory appeared; stopping'; exit 2
fi
mv -- "$TMP" "$STAGE"
trap - EXIT
chmod 700 "$STAGE" "$STAGE/scripts" "$STAGE/tests"
echo 'ATLAS_OBSERVER_MCP=PINNED_OFFLINE_STAGE_TESTS_PASSED'
echo 'OBSERVER_CONTAINER=NOT_STARTED'
echo 'EXISTING_CANARY_AND_TUNNEL=UNCHANGED'
echo 'CHATGPT_PLUGIN=UNCHANGED'
echo 'SPEND_GBP=0'
