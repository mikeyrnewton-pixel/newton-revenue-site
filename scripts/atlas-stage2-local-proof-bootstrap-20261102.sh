#!/bin/bash
# Stage 2: owner-initiated, isolated local PROOF staging only.
# No remote MCP writes, daemon, shell access, Docker restarts or external actions.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_STAGE2_BOOTSTRAP=%s\n' "$1"; }
hold(){ say "HOLD_$1";exit 2; }
[ "$#" -eq 1 ] && [ "$1" = --stage-isolated-proof ] || hold EXACT_MODE_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_REQUIRED
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] && "$D" info >/dev/null 2>&1 || hold DOCKER_NOT_AVAILABLE
OBS=atlas-mcp-observer-review
[ "$("$D" inspect --format '{{.State.Running}}' "$OBS" 2>/dev/null)" = true ] ||
 hold OBSERVER_NOT_RUNNING
[ "$("$D" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$OBS" 2>/dev/null)" = true ] ||
 hold OBSERVER_CONFINEMENT_CHANGED
IMAGE="$("$D" inspect --format '{{.Image}}' "$OBS" 2>/dev/null)" || hold IMAGE_NOT_FOUND
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || hold IMAGE_UNPINNED
SOURCE_DIR="$HOME/.atlas-stage2-proof-source"
STATE_DIR="$HOME/.atlas-stage2-proof-private"
FILE="$SOURCE_DIR/atlas-stage2-controlled-executor.mjs"
SOURCE_SHA=ea7fba3885cc9b04e6bcad04acb97261adb860f5
PIN=3299f309673091bcd2f0d82bcb615ca70a568cb3
URL="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/$PIN/scripts/atlas-stage2-controlled-executor.mjs"
private_dir(){
 local dir="$1"
 [ ! -L "$dir" ] || hold DIRECTORY_IS_SYMLINK
 if [ ! -d "$dir" ]; then mkdir -m 700 "$dir" || hold DIRECTORY_CREATION; fi
 [ -d "$dir" ] && [ ! -L "$dir" ] &&
 [ "$(stat -f %u "$dir")" = "$(id -u)" ] &&
 [ "$(stat -f %Lp "$dir")" = 700 ] || hold DIRECTORY_NOT_PRIVATE
}
case "$SOURCE_DIR:$STATE_DIR" in *','*|*$'\n'*|*$'\r'*) hold UNSAFE_MOUNT_PATH;; esac
private_dir "$SOURCE_DIR"
private_dir "$STATE_DIR"
if [ -e "$FILE" ] || [ -L "$FILE" ]; then
 [ -f "$FILE" ] && [ ! -L "$FILE" ] &&
 [ "$(/usr/bin/git hash-object "$FILE" 2>/dev/null)" = "$SOURCE_SHA" ] ||
  hold EXISTING_SOURCE_UNVERIFIED
else
 TMP="$(mktemp "$SOURCE_DIR/.atlas-stage2.XXXXXXXX")" || hold TEMP_FAILED
 trap 'rm -f "$TMP" >/dev/null 2>&1 || true' EXIT
 /usr/bin/curl -fsSL --max-time 30 "$URL" -o "$TMP" >/dev/null 2>&1 ||
   hold DOWNLOAD_FAILED
 [ "$(/usr/bin/git hash-object "$TMP" 2>/dev/null)" = "$SOURCE_SHA" ] ||
   hold SOURCE_HASH_FAILED
 chmod 600 "$TMP"
 # Never overwrite pre-existing source. Exact code only.
 /bin/ln "$TMP" "$FILE" 2>/dev/null || hold SOURCE_ALREADY_EXISTS
 /bin/rm "$TMP"
 trap - EXIT
fi
[ "$(stat -f %u "$FILE")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$FILE")" = 600 ] &&
[ "$(stat -f %l "$FILE")" = 1 ] || hold SOURCE_FILE_NOT_PRIVATE
# New ephemeral sandbox. Network disabled. No Docker socket or credentials.
# Only reviewed source mount is read-only; private proof state mount is writable.
"$D" run --rm --pull=never --network none --read-only \
 --cap-drop ALL --security-opt no-new-privileges:true \
 --pids-limit 32 --memory 128m --cpus 0.25 \
 --user "$(id -u):$(id -g)" \
 --env HOME=/run/atlas-stage2 \
 --mount "type=bind,src=$SOURCE_DIR,dst=/opt/atlas-stage2,readonly" \
 --mount "type=bind,src=$STATE_DIR,dst=/run/atlas-stage2" \
 --entrypoint node "$IMAGE" \
 /opt/atlas-stage2/atlas-stage2-controlled-executor.mjs list ||
 hold ISOLATED_LIST_FAILED
[ "$("$D" inspect --format '{{.State.Running}}' "$OBS" 2>/dev/null)" = true ] ||
 hold OBSERVER_STATE_CHANGED
say PROOF_SOURCE_STAGED_ISOLATED_LIST_OK
say NO_REMOTE_ACTIONS_NO_TUNNEL_CHANGES
