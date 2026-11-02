#!/bin/bash
# ATLAS Stage2: narrowly-scoped fix of exact 30min proposal TTL bug.
# Owner-run once. No network for Docker, no Mac services/tunnels touched.
# Downloads only pinned code; backs up original and proposes a NEW action.
# Does NOT approve or execute anything.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_STAGE2_CLOCK_FIX=%s\n' "$1"; }
hold(){ say "HOLD_$1";exit 2; }
[ "$#" -eq 1 ] && [ "$1" = "--install-and-propose" ] || hold EXACT_MODE_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] && "$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
OBS=atlas-mcp-observer-review
[ "$("$D" inspect --format '{{.State.Running}}' "$OBS" 2>/dev/null)" = true ] &&
[ "$("$D" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$OBS" 2>/dev/null)" = true ] ||
hold OBSERVER_NOT_HEALTHY
IMAGE="$("$D" inspect --format '{{.Image}}' "$OBS" 2>/dev/null)" || hold IMAGE_UNKNOWN
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || hold IMAGE_NOT_PINNED
S="$HOME/.atlas-stage2-proof-source"
P="$HOME/.atlas-stage2-proof-private"
TARGET="$S/atlas-stage2-controlled-executor.mjs"
BACKUP="$S/atlas-stage2-controlled-executor.pre-clock-fix.mjs"
OLD_SHA=ea7fba3885cc9b04e6bcad04acb97261adb860f5
NEW_SHA=72bd99a0dbedc75d30e1d75ecca5c7a7df321a3e
PIN=5d652cf72ea6f114b5838a5f037c48b2f34d0467
URL="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/$PIN/scripts/atlas-stage2-controlled-executor.mjs"
sha(){ /usr/bin/git hash-object "$1" 2>/dev/null || true; }
private_dir(){
 [ -d "$1" ] && [ ! -L "$1" ] &&
 [ "$(stat -f %u "$1")" = "$(id -u)" ] &&
 [ "$(stat -f %Lp "$1")" = 700 ] || hold PRIVATE_DIRECTORY_CHANGED
}
private_dir "$S"
private_dir "$P"
[ -f "$TARGET" ] && [ ! -L "$TARGET" ] &&
[ "$(stat -f %u "$TARGET")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$TARGET")" = 600 ] &&
[ "$(stat -f %l "$TARGET")" = 1 ] || hold ORIGINAL_FILE_UNSAFE
case "$(sha "$TARGET")" in
 "$OLD_SHA") ;;
 "$NEW_SHA") hold ALREADY_PATCHED_DO_NOT_REISSUE ;;
 *) hold UNEXPECTED_ORIGINAL_HASH;;
esac
[ ! -e "$BACKUP" ] && [ ! -L "$BACKUP" ] || hold BACKUP_ALREADY_EXISTS
# Avoid strange mount source injection before Docker invocation.
case "$S:$P" in *','*|*$'\n'*|*$'\r'*) hold UNSAFE_MOUNT_PATH;; esac
runNode() {
 "$D" run --rm --pull=never --network none --read-only \
 --cap-drop ALL --security-opt no-new-privileges:true \
 --pids-limit 32 --memory 128m --cpus 0.25 \
 --user "$(id -u):$(id -g)" --env HOME=/run/atlas-stage2 \
 --mount "type=bind,src=$S,dst=/opt/atlas-stage2,readonly" \
 --mount "type=bind,src=$P,dst=/run/atlas-stage2" \
 --entrypoint node "$IMAGE" "$@"
}
TMP="$(mktemp "$S/.atlas-stage2-ttl.XXXXXXXX")" || hold DOWNLOAD_TEMP_FAILED
trap 'rm -f "$TMP" 2>/dev/null || true' EXIT
if ! /usr/bin/curl -fsSL --max-time 30 "$URL" -o "$TMP" >/dev/null 2>&1;then
 hold DOWNLOAD_FAILED
fi
[ "$(sha "$TMP")" = "$NEW_SHA" ] || hold DOWNLOAD_HASH_MISMATCH
chmod 600 "$TMP"
NAME="$(basename "$TMP")"
if ! runNode --check "/opt/atlas-stage2/$NAME" >/dev/null 2>&1;then
 hold NODE_SYNTAX_CHECK_FAILED
fi
# Backup is owner private and only created if absent, never overwritten.
if ! /bin/ln "$TARGET" "$BACKUP" 2>/dev/null;then hold BACKUP_CREATE_FAILED;fi
# Hardlink backup would share inode; ensure original backup is independent.
BP="$S/.atlas-stage2-backup.XXXXXXXX"
BPTMP="$(mktemp "$BP")" || hold BACKUP_TEMP_FAILED
if ! cp "$TARGET" "$BPTMP" || ! chmod 600 "$BPTMP" ||
 [ "$(sha "$BPTMP")" != "$OLD_SHA" ];then hold BACKUP_VERIFY_FAILED;fi
# Replace hardlink using a separate inode, preserving pre-fix source.
mv -f "$BPTMP" "$BACKUP" || hold BACKUP_MOVE_FAILED
[ "$(sha "$BACKUP")" = "$OLD_SHA" ] &&
[ "$(stat -f %l "$BACKUP")" = 1 ] || hold BACKUP_NOT_VERIFIED
[ "$(sha "$TARGET")" = "$OLD_SHA" ] || hold SOURCE_CHANGED_DURING_STAGE
mv -f "$TMP" "$TARGET" || hold PATCH_INSTALL_FAILED
trap - EXIT
[ "$(sha "$TARGET")" = "$NEW_SHA" ] || hold PATCH_INSTALLED_HASH_FAILED
say FIXED_SOURCE_INSTALLED_ORIGINAL_BACKED_UP
# Fresh request only. The old 15:21 proposal is intentionally not approved.
if ! runNode /opt/atlas-stage2/atlas-stage2-controlled-executor.mjs propose local_proof_v1;then
 hold NEW_PROPOSAL_FAILED
fi
say NEW_PROPOSAL_CREATED_NOT_APPROVED
say ORIGINAL_TUNNELS_AND_OBSERVER_UNCHANGED
