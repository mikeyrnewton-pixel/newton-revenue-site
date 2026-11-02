#!/bin/bash
# ATLAS owner iPhone SSH: stage corrected source and run READ-ONLY preflight.
# No Docker start/stop, no tunnel switch, no secret or plugin changes.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_ENTRYFIX=%s\n' "$1"; }
hold(){ say "HOLD_$1"; exit 2; }
[ "$#" -eq 0 ] || hold NO_ARGUMENTS_ALLOWED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
dir="$HOME/.atlas-observer-cutover-code"
[ -d "$HOME" ] && [ ! -L "$HOME" ] || hold HOME_UNSAFE
[ -d "$dir" ] && [ ! -L "$dir" ] || hold SOURCE_DIRECTORY_NOT_STAGED
[ "$(stat -f %u "$dir")" = "$(id -u)" ] && [ "$(stat -f %Lp "$dir")" = 700 ] ||
  hold STAGING_PERMISSIONS
stage3="$dir/atlas-observer-stage3-preflight-20261024.sh"
[ -f "$stage3" ] && [ ! -L "$stage3" ] || hold STAGE3_NOT_STAGED
[ "$(/usr/bin/git hash-object "$stage3" 2>/dev/null)" = 3d06691eaf200e5be3669d8e35da0394c15fb628 ] ||
  hold STAGE3_HASH_MISMATCH
target="$dir/atlas-observer-headless-cutover-20261029.sh"
[ ! -L "$target" ] || hold TARGET_SYMLINK
temp="$(mktemp "$dir/.entryfix.XXXXXXXX")" || hold TEMP_FAILED
url='https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/38336c1e33d416866749a7544b0ded4bac4a4846/scripts/atlas-observer-headless-cutover-20261029.sh'
if ! /usr/bin/curl -fsSL --max-time 30 "$url" -o "$temp" >/dev/null 2>&1;then
  rm -f "$temp"; hold DOWNLOAD_FAILED
fi
if [ "$(/usr/bin/git hash-object "$temp" 2>/dev/null)" != aff88a85b5cac2d93958ce4aca6d333fae6e8196 ];then
  rm -f "$temp"; hold HASH_MISMATCH
fi
chmod 600 "$temp" || hold FILE_PERMISSIONS
mv -f "$temp" "$target" || hold STAGING_FAILED
say CORRECTED_OPERATOR_HASH_VERIFIED
say NO_MAC_CUTOVER
if /bin/bash "$target" --preflight;then
  say READ_ONLY_PREFLIGHT_PASS
else
  say READ_ONLY_PREFLIGHT_HELD
  exit 2
fi
