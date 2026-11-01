#!/bin/bash
# Pinned owner-SSH one-step: stage the verified stopped-candidate resume.
# Only already-authorised reversible read-only ATLAS tunnel cutover permitted.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_OWNER_RESUME=%s\n' "$1"; }
hold(){ say "HOLD_$1";exit 2; }
[ "$#" -eq 0 ] || hold ARGUMENTS_NOT_ACCEPTED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
dir="$HOME/.atlas-observer-cutover-code"
[ -d "$dir" ] && [ ! -L "$dir" ] &&
[ "$(stat -f %u "$dir")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$dir")" = 700 ] || hold STAGING_DIR_NOT_PRIVATE
rollback="$dir/atlas-observer-headless-cutover-bash32-20261101.sh"
stage3="$dir/atlas-observer-stage3-preflight-20261024.sh"
[ "$(/usr/bin/git hash-object "$rollback" 2>/dev/null)" = d8f9948b9fb51412b453b170b6c5c9d619f39d8c ] ||
  hold ROLLBACK_OPERATOR_NOT_VERIFIED
[ "$(/usr/bin/git hash-object "$stage3" 2>/dev/null)" = 3d06691eaf200e5be3669d8e35da0394c15fb628 ] ||
  hold STAGE3_NOT_VERIFIED
target="$dir/atlas-observer-resume-stopped-candidate-20261101.sh"
[ ! -e "$target" ] && [ ! -L "$target" ] || hold RESUME_FILE_ALREADY_PRESENT
temp="$(mktemp "$dir/.resume-reviewed.XXXXXXXX")" || hold TEMP_FILE_FAILED
url='https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/16301b723f863c134592af32472f9513db631200/scripts/atlas-observer-resume-stopped-candidate-20261101.sh'
if ! /usr/bin/curl -fsSL --max-time 30 "$url" -o "$temp" >/dev/null 2>&1; then
  rm -f "$temp";hold DOWNLOAD_FAILED
fi
if [ "$(/usr/bin/git hash-object "$temp" 2>/dev/null)" != 147e2d3d7dcf64cf54023bdc0d75225b7aad9704 ]; then
  rm -f "$temp";hold RESUME_SOURCE_HASH
fi
if ! /bin/bash -n "$temp"; then
  rm -f "$temp";hold BASH_SYNTAX
fi
chmod 600 "$temp" || hold STAGED_PERMISSIONS
mv "$temp" "$target" || hold STAGED_MOVE
say PATCHED_RESUME_VERIFIED
ATLAS_REVIEWED_KEY_MATCH=YES ATLAS_WORKSPACE_MATCH=YES \
  /bin/bash "$target" --apply-existing-candidate
say APPLY_SCRIPT_EXITED_SUCCESSFULLY
