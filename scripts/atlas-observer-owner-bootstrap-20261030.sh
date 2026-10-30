#!/bin/bash
# ATLAS owner-iPhone SSH: stage pinned, verified no-Node cutover + preflight.
# Never starts/stops containers, reads secret bytes, or changes plugins.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_BOOTSTRAP=%s\n' "$1"; }
stop(){ say "HOLD_$1"; exit 2; }
[ "$#" -eq 0 ] || stop NO_ARGUMENTS_ACCEPTED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || stop OWNER_MAC_ONLY
dir="$HOME/.atlas-observer-cutover-code"
[ -d "$HOME" ] && [ ! -L "$HOME" ] || stop HOME_INVALID
[ ! -L "$dir" ] || stop STAGING_DIR_SYMLINK
if [ ! -d "$dir" ]; then
  mkdir -m 700 "$dir" || stop STAGING_DIR_UNAVAILABLE
fi
[ -d "$dir" ] && [ "$(stat -f %u "$dir")" = "$(id -u)" ] ||
  stop STAGING_DIR_OWNER_MISMATCH
chmod 700 "$dir" || stop STAGING_DIR_PERMISSIONS
base='https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/7abf51722e05a272d0b39bd7e415971c86716df0/scripts'
# Pin the FULL source, not just "latest": owner can reproduce this exact audit.
fileA=atlas-observer-headless-cutover-20261029.sh
hashA=0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5
fileB=atlas-observer-stage3-preflight-20261024.sh
hashB=3d06691eaf200e5be3669d8e35da0394c15fb628
stage(){
  local name="$1" expected="$2" temp actual
  temp="$(mktemp "$dir/.atlas-source.XXXXXXXX")" || stop TEMPORARY_FILE_FAILED
  if ! /usr/bin/curl --fail --silent --show-error --location --max-time 30 \
       "$base/$name" --output "$temp" >/dev/null 2>&1; then
    rm -f "$temp"
    stop SOURCE_DOWNLOAD_FAILED
  fi
  actual="$(/usr/bin/git hash-object "$temp" 2>/dev/null)" || {
    rm -f "$temp"
    stop GIT_HASH_UNAVAILABLE
  }
  if [ "$actual" != "$expected" ]; then
    rm -f "$temp"
    stop SOURCE_HASH_MISMATCH
  fi
  # Do not follow symlinks in an existing staging file.
  [ ! -L "$dir/$name" ] || {
    rm -f "$temp"
    stop SOURCE_DESTINATION_SYMLINK
  }
  chmod 600 "$temp" || stop SOURCE_PERMISSIONS
  mv -f "$temp" "$dir/$name" || stop SOURCE_MOVE_FAILED
}
stage "$fileA" "$hashA"
stage "$fileB" "$hashB"
say BOTH_SOURCE_HASHES_VERIFIED
# The only executed target is the two-file pinned, owner-local read-only preflight.
# It never performs cutover or restarts Docker.
if /bin/bash "$dir/$fileA" --preflight; then
  say READ_ONLY_PREFLIGHT_RETURNED_SUCCESS
else
  say PREFLIGHT_HELD_NO_MAC_CUTOVER
  exit 2
fi
