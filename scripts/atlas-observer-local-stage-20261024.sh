#!/bin/bash
# ATLAS OBSERVER STAGING ONLY — NOT A DEPLOYMENT.
# Stages precisely three immutable, Git-blob-verified files from an owner
# downloaded authenticated GitHub archive; runs only offline tests.
# NO Docker, tunnel, plugin, LaunchAgent, payment, or network change.
set -euo pipefail
umask 077

COMMIT='1053f4251c7d092e9f1afbe709b89bcb27dea096'
TOP="newton-revenue-site-$COMMIT"
ARCHIVE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Atlas/$TOP.zip"
STAGE="$HOME/ATLAS-OBSERVER-MCP-REVIEW-20261024"
NODE="$HOME/ATLAS-LOCAL-SETUP/node/bin/node"

if [ "${1:-}" != '--stage-offline-only' ] || [ "$#" -ne 1 ]; then
  echo 'HOLD: Source staging only. Exact switch: --stage-offline-only' >&2; exit 2
fi
if [ "$(uname -s)" != 'Darwin' ] || [ "$(id -u)" -eq 0 ]; then
  echo 'HOLD: non-root Mac owner session required' >&2; exit 2
fi
if ! /usr/bin/pmset -g batt | /usr/bin/grep -q "Now drawing from 'AC Power'"; then
  echo 'HOLD: AC power required' >&2; exit 2
fi
if [ ! -x "$NODE" ] || [ ! -x /usr/bin/unzip ] || [ ! -x /usr/bin/git ]; then
  echo 'HOLD: existing local Node, unzip or git unavailable' >&2; exit 2
fi
if [ ! -f "$ARCHIVE" ] || [ -L "$ARCHIVE" ]; then
  echo 'HOLD: pinned ZIP missing from Atlas iCloud Downloads' >&2; exit 2
fi
if [ -e "$STAGE" ] || [ -L "$STAGE" ]; then
  echo 'HOLD: staging directory exists; never overwrite' >&2; exit 2
fi

TEMP="$(/usr/bin/mktemp -d "$HOME/.atlas-observer-mcp-stage.XXXXXXXX")"
cleanup() { [ ! -d "$TEMP" ] || /bin/rm -rf -- "$TEMP"; }
trap cleanup EXIT
/bin/mkdir -p "$TEMP/scripts" "$TEMP/tests"
while IFS='|' read -r FILE BLOB_SHA; do
  [ -n "$FILE" ] || continue
  OUT="$TEMP/$FILE"
  if ! /usr/bin/unzip -p "$ARCHIVE" "$TOP/$FILE" > "$OUT"; then
    echo 'HOLD: source entry missing' >&2; exit 2
  fi
  if [ ! -s "$OUT" ] || [ "$(/usr/bin/git hash-object "$OUT")" != "$BLOB_SHA" ]; then
    echo "HOLD: source integrity mismatch: $FILE" >&2; exit 2
  fi
  /bin/chmod 600 "$OUT"
  echo "PINNED_AND_VERIFIED=$FILE"
done <<'SOURCES'
scripts/atlas-mcp-observer.mjs|56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5
scripts/atlas-observer-snapshot.mjs|7dde06ee91ce6776c6e6217e4dd43c402f678d79
tests/atlas-mcp-observer.test.mjs|0b43927fbe6843d05a6241785b83ed8d55b1b804
SOURCES

"$NODE" --check "$TEMP/scripts/atlas-mcp-observer.mjs" >/dev/null
"$NODE" --check "$TEMP/scripts/atlas-observer-snapshot.mjs" >/dev/null
"$NODE" --check "$TEMP/tests/atlas-mcp-observer.test.mjs" >/dev/null
# The offline suite opens only an ephemeral loopback test listener, not
# customer or tunnel services. A test-only umask 022 permits denial fixtures.
if ! (umask 022; "$NODE" --test "$TEMP/tests/atlas-mcp-observer.test.mjs") > "$TEMP/test-output.log" 2>&1; then
  echo 'HOLD: offline tests failed (last ten lines)' >&2
  /usr/bin/tail -n 10 "$TEMP/test-output.log" >&2
  exit 2
fi
/usr/bin/tail -n 8 "$TEMP/test-output.log"
/bin/rm -f "$TEMP/test-output.log"
if [ -e "$STAGE" ] || [ -L "$STAGE" ]; then
  echo 'HOLD: unexpected existing stage' >&2; exit 2
fi
/bin/mv -- "$TEMP" "$STAGE"
/bin/chmod 700 "$STAGE" "$STAGE/scripts" "$STAGE/tests"
echo 'ATLAS_OBSERVER_MCP=PINNED_OFFLINE_STAGE_TESTS_PASSED'
echo 'OBSERVER_CONTAINER=NOT_STARTED'
echo 'EXISTING_CANARY_AND_TUNNEL=NOT_CHANGED'
echo 'CUSTOM_PLUGIN=NOT_CHANGED'
echo 'SPEND_GBP=0'
