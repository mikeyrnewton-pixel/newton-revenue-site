#!/bin/bash
# ATLAS Observer Stage 2 iPhone handoff. Owner-approved local-only activation.
# No tunnel/plugin/restart/production changes. Never executes unverified code.
set -euo pipefail
umask 077
echo 'ATLAS_BOOTSTRAP=STARTED'
if [ "$#" -ne 1 ] || [ "$1" != '--start-local-only' ]; then
  echo 'HOLD: explicit --start-local-only required'; exit 2
fi
if [ "$(uname -s)" != Darwin ] || [ "$(id -u)" = 0 ]; then
  echo 'HOLD: non-root Mac owner required'; exit 2
fi
FILE=$(/usr/bin/mktemp -t atlas-stage2-installer) || { echo 'HOLD: temp file unavailable'; exit 2; }
finish() {
  status=$?
  trap - EXIT
  /bin/rm -f "$FILE"
  printf 'ATLAS_BOOTSTRAP_EXIT=%s\n' "$status"
}
trap finish EXIT
URL='https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/d87e78dcc416d5127d79e0eef43c34afc3bcbe62/scripts/atlas-observer-local-container-20261024.sh'
if ! /usr/bin/curl -fsSL --proto '=https' --tlsv1.2 --connect-timeout 12 --max-time 60 -o "$FILE" "$URL"; then
  echo 'HOLD: immutable installer HTTPS download failed'; exit 2
fi
if [ "$(/usr/bin/git hash-object "$FILE")" != '55b3e5dbdf6e3d010ca35e8f4d00dd7288079566' ]; then
  echo 'HOLD: immutable installer SHA mismatch'; exit 2
fi
if ! /bin/bash -n "$FILE"; then
  echo 'HOLD: installer bash syntax error'; exit 2
fi
echo 'ATLAS_BOOTSTRAP=INSTALLER_HASH_AND_SYNTAX_VERIFIED'
# The reviewed installer performs its own Docker security preflight, permits
# only this exact switch, starts at most one review-only container, and tests
# its local MCP status. On failed post-create checks it cleans only that ID.
/bin/bash "$FILE" --start-local-only 2>&1
