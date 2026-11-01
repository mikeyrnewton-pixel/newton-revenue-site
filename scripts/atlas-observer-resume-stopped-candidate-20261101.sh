#!/bin/bash
# Owner-invoked, reversible resume of the ALREADY-created stopped candidate.
# This script NEVER creates, removes or changes a container or secret.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_RESUME=%s\n' "$1"; }
hold(){ say "HOLD_$1";exit 2; }
[ "$#" -eq 1 ] || hold MODE_REQUIRED
case "$1" in --inspect-only|--apply-existing-candidate) ;; *) hold MODE_UNRECOGNISED;; esac
mode="$1"
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] && "$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
OLD=atlas-tunnel-client-canary
NEW=atlas-tunnel-client-observer-candidate
CANARY=atlas-mcp-readonly-canary
OBS=atlas-mcp-observer-review
PREF="$HOME/.atlas-observer-cutover-code/atlas-observer-stage3-preflight-20261024.sh"
DIR="$HOME/.atlas-observer-headless-rollback"
GUARD="$DIR/ids"
fmt(){ "$D" inspect --format "$1" "$2" 2>/dev/null || hold INSPECT_FAILED; }
valid(){ [[ "$1" =~ ^[a-f0-9]{64}$ ]] || hold INVALID_CONTAINER_ID; }
[ ! -e "$GUARD" ] && [ ! -L "$GUARD" ] || hold EXISTING_ROLLBACK_RECORD
[ -f "$PREF" ] && [ ! -L "$PREF" ] &&
[ "$(/usr/bin/git hash-object "$PREF" 2>/dev/null)" = 3d06691eaf200e5be3669d8e35da0394c15fb628 ] ||
  hold STAGE3_HASH
receipt="$(/bin/bash "$PREF" --inspect-only 2>&1)" || hold STAGE3_NOT_READY
[[ "$receipt" == *ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED* ]] ||
  hold STAGE3_NOT_VERIFIED
[ "$(fmt '{{.State.Running}}' "$OLD")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$CANARY")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$OBS")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$NEW")" = false ] ||
  hold CONTAINER_STATE_CHANGED
[ "$(fmt '{{.HostConfig.AutoRemove}}' "$OLD")" = false ] &&
[ "$(fmt '{{.HostConfig.AutoRemove}}' "$NEW")" = false ] ||
  hold AUTO_REMOVE_UNSAFE
a="$(fmt '{{.Id}}' "$CANARY")"
b="$(fmt '{{.Id}}' "$OLD")"
c="$(fmt '{{.Id}}' "$NEW")"
valid "$a";valid "$b";valid "$c"
[ "$a" != "$b" ] && [ "$a" != "$c" ] && [ "$b" != "$c" ] ||
  hold DUPLICATE_IDS
network="$(fmt '{{.HostConfig.NetworkMode}}' "$NEW")"
case "$network" in "container:$CANARY"|"container:$a") ;; *) hold NETWORK_MISMATCH;; esac
[ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$NEW")" = true ] &&
[ "$(fmt '{{.HostConfig.Privileged}}' "$NEW")" = false ] &&
[ "$(fmt '{{.HostConfig.RestartPolicy.Name}}' "$NEW")" = no ] &&
[ "$(fmt '{{range .HostConfig.CapDrop}}{{if eq . "ALL"}}yes{{end}}{{end}}' "$NEW")" = yes ] &&
[ "$(fmt '{{len .HostConfig.CapAdd}}' "$NEW")" = 0 ] &&
[ "$(fmt '{{range .HostConfig.SecurityOpt}}{{if or (eq . "no-new-privileges") (eq . "no-new-privileges:true")}}yes{{end}}{{end}}' "$NEW")" = yes ] ||
  hold CONFINEMENT_MISMATCH
ports="$(fmt '{{json .HostConfig.PortBindings}}' "$NEW")"
[ "$ports" = null ] || [ "$ports" = '{}' ] || hold HOST_PORTS_EXPOSED
[ "$(fmt '{{len .Mounts}}' "$NEW")" = 1 ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if and (eq .Type "bind") (not .RW)}}yes{{end}}{{end}}{{end}}' "$NEW")" = yes ] ||
  hold MOUNT_UNSAFE
key_old="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$OLD")"
key_new="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$NEW")"
[ -n "$key_old" ] && [ "$key_old" = "$key_new" ] &&
[ -f "$key_old" ] && [ ! -L "$key_old" ] || hold KEY_NOT_IDENTICAL
for field in '{{.Image}}' '{{json .Config.Entrypoint}}' '{{json .Config.Cmd}}' '{{json .Args}}' '{{.Config.User}}'; do
  [ "$(fmt "$field" "$OLD")" = "$(fmt "$field" "$NEW")" ] ||
    hold ORIGINAL_IMAGE_OR_COMMAND_NOT_MATCHED
done
[ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}' "$OLD")" = yes ] &&
[ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18788/mcp"}}yes{{end}}{{end}}' "$NEW")" = yes ] ||
  hold OBSERVER_ENDPOINT_NOT_MATCHED
# Compare local env lists without printing their values, replacing only URL.
eold="$(fmt '{{range .Config.Env}}{{println .}}{{end}}' "$OLD" | /usr/bin/sed 's@^MCP_SERVER_URL=http://127.0.0.1:18787/mcp$@MCP_SERVER_URL=http://127.0.0.1:18788/mcp@' | LC_ALL=C /usr/bin/sort)"
enew="$(fmt '{{range .Config.Env}}{{println .}}{{end}}' "$NEW" | LC_ALL=C /usr/bin/sort)"
[ "$eold" = "$enew" ] || hold ENVIRONMENT_MISMATCH
say EXISTING_CANDIDATE_SECURITY_VERIFIED
say ORIGINAL_STILL_RUNNING
[ "$mode" = --inspect-only ] && exit 0
[ "$(printenv ATLAS_REVIEWED_KEY_MATCH 2>/dev/null)" = YES ] &&
[ "$(printenv ATLAS_WORKSPACE_MATCH 2>/dev/null)" = YES ] ||
  hold RESTRICTED_KEY_OR_WORKSPACE_NOT_ATTESTED
[ -d "$HOME" ] && [ ! -L "$HOME" ] && [ ! -L "$DIR" ] ||
  hold GUARD_DIR_UNSAFE
if [ ! -d "$DIR" ]; then mkdir -m 700 "$DIR" || hold GUARD_CREATION_FAILED;fi
[ "$(stat -f %u "$DIR")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$DIR")" = 700 ] || hold GUARD_PERMISSIONS
mkdir "$DIR/lock" 2>/dev/null || hold CUTOVER_ALREADY_RUNNING
trap 'rmdir "$DIR/lock" >/dev/null 2>&1 || true' EXIT
[ ! -e "$GUARD" ] && [ ! -L "$GUARD" ] || hold GUARD_ALREADY_EXISTS
(set -C;printf '%s\n%s\n%s\n' "$a" "$b" "$c" > "$GUARD") ||
  hold GUARD_WRITE_FAILED
chmod 600 "$GUARD" || hold GUARD_PERMISSIONS
# No overlap: stop original first, and restore it on any start failure.
if ! "$D" container stop --time 10 "$OLD" >/dev/null 2>&1; then
  if [ "$(fmt '{{.State.Running}}' "$OLD")" != true ];then
    "$D" container start "$OLD" >/dev/null 2>&1 ||
      hold ORIGINAL_RESTART_FAILED_KEEP_GUARD
  fi
  hold ORIGINAL_STOP_FAILED_KEEP_GUARD
fi
if ! "$D" container start "$NEW" >/dev/null 2>&1;then
  if [ "$(fmt '{{.State.Running}}' "$NEW")" = true ];then
    "$D" container stop --time 10 "$NEW" >/dev/null 2>&1 ||
      hold CANDIDATE_STOP_FAILED_KEEP_GUARD
  fi
  "$D" container start "$OLD" >/dev/null 2>&1 ||
    hold ORIGINAL_RESTART_FAILED_KEEP_GUARD
  hold CANDIDATE_START_FAILED_ORIGINAL_RESTORED_KEEP_GUARD
fi
if [ "$(fmt '{{.State.Running}}' "$NEW")" != true ] ||
   [ "$(fmt '{{.State.Running}}' "$OLD")" != false ];then
  "$D" container stop --time 10 "$NEW" >/dev/null 2>&1 ||
    hold NEW_STOP_FAILED_KEEP_GUARD
  "$D" container start "$OLD" >/dev/null 2>&1 ||
    hold ORIGINAL_RESTART_FAILED_KEEP_GUARD
  hold STATE_INVALID_ORIGINAL_RESTORED_KEEP_GUARD
fi
say LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED
say ORIGINAL_STOPPED_PRESERVED
say ROLLBACK_RECORD_READY
