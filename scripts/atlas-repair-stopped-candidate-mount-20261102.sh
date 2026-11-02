#!/bin/bash
# Repair ONLY the stopped Observer candidate's incorrect Docker bind source.
# Reuses the already-running original's existing owner-private file; never reads it.
# Never stops original tunnel, starts candidate, changes a key, or makes remote calls.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_REPAIR=%s\n' "$1"; }
hold(){ say "HOLD_$1"; exit 2; }
[ "$#" -eq 1 ] && [ "$1" = --repair-stopped-candidate ] || hold EXACT_MODE_REQUIRED
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
[ ! -e "$GUARD" ] && [ ! -L "$GUARD" ] || hold ROLLBACK_GUARD_EXISTS
[ -f "$PREF" ] && [ ! -L "$PREF" ] &&
[ "$(/usr/bin/git hash-object "$PREF" 2>/dev/null)" = 3d06691eaf200e5be3669d8e35da0394c15fb628 ] || hold STAGE3_UNVERIFIED
receipt="$(/bin/bash "$PREF" --inspect-only 2>&1)" || hold STAGE3_FAILED
[[ "$receipt" == *ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED* ]] || hold STAGE3_INCOMPLETE
[ "$(fmt '{{.State.Running}}' "$OLD")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$CANARY")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$OBS")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$NEW")" = false ] || hold CONTAINER_STATE_CHANGED
[ "$(fmt '{{.HostConfig.AutoRemove}}' "$OLD")" = false ] &&
[ "$(fmt '{{.HostConfig.AutoRemove}}' "$NEW")" = false ] || hold AUTO_REMOVE
[ "$(fmt '{{len .Mounts}}' "$OLD")" = 1 ] &&
[ "$(fmt '{{len .Mounts}}' "$NEW")" = 1 ] || hold MOUNT_COUNT_CHANGED
src="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$OLD")"
candidate_src="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$NEW")"
[ "$src" = "$HOME/.atlas-tunnel/runtime-key" ] &&
[ -f "$src" ] && [ ! -L "$src" ] &&
[ "$(stat -f %u "$src")" = "$(id -u)" ] &&
[ "$(stat -f %l "$src")" = 1 ] || hold ORIGINAL_KEY_SOURCE_UNSAFE
case "$(stat -f %Lp "$src")" in 400|600) ;; *) hold ORIGINAL_KEY_PERMISSIONS;; esac
case "$src" in *','*|*$'\n'*) hold KEY_PATH_FORMAT;; esac
[ "$candidate_src" != "$src" ] && [ -n "$candidate_src" ] &&
[ "${candidate_src#/}" != "$candidate_src" ] &&
[ ! -L "$candidate_src" ] && [ ! -f "$candidate_src" ] ||
  hold CANDIDATE_SOURCE_NOT_EXPECTED_MISMATCH
# An unrelated source may be absent or a directory created by Docker; never
# read, overwrite, move or remove the old source. Only replace the stopped
# candidate container after all remaining confinement and identity guards.
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if and (eq .Type "bind") (not .RW)}}yes{{end}}{{end}}{{end}}' "$OLD")" = yes ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if and (eq .Type "bind") (not .RW)}}yes{{end}}{{end}}{{end}}' "$NEW")" = yes ] || hold KEY_BIND_UNSAFE
canary_id="$(fmt '{{.Id}}' "$CANARY")"
[[ "$canary_id" =~ ^[a-f0-9]{64}$ ]] || hold CANARY_ID_INVALID
network="$(fmt '{{.HostConfig.NetworkMode}}' "$NEW")"
case "$network" in "container:$CANARY"|"container:$canary_id") ;; *) hold CANDIDATE_NETWORK_UNSAFE;; esac
[ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$NEW")" = true ] &&
[ "$(fmt '{{.HostConfig.Privileged}}' "$NEW")" = false ] &&
[ "$(fmt '{{.HostConfig.RestartPolicy.Name}}' "$NEW")" = no ] &&
[ "$(fmt '{{range .HostConfig.CapDrop}}{{if eq . "ALL"}}yes{{end}}{{end}}' "$NEW")" = yes ] &&
[ "$(fmt '{{len .HostConfig.CapAdd}}' "$NEW")" = 0 ] &&
[ "$(fmt '{{range .HostConfig.SecurityOpt}}{{if or (eq . "no-new-privileges") (eq . "no-new-privileges:true")}}yes{{end}}{{end}}' "$NEW")" = yes ] || hold CONFINEMENT_CHANGED
ports="$(fmt '{{json .HostConfig.PortBindings}}' "$NEW")"
[ "$ports" = null ] || [ "$ports" = '{}' ] || hold PORTS_EXPOSED
for field in '{{.Image}}' '{{json .Config.Entrypoint}}' '{{json .Config.Cmd}}' '{{json .Args}}' '{{.Config.User}}'; do
  [ "$(fmt "$field" "$OLD")" = "$(fmt "$field" "$NEW")" ] || hold ORIGINAL_CONFIG_MISMATCH
done
image="$(fmt '{{.Image}}' "$OLD")"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || hold IMAGE_NOT_PINNED
[ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}' "$OLD")" = yes ] &&
[ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18788/mcp"}}yes{{end}}{{end}}' "$NEW")" = yes ] || hold TARGET_MISMATCH
eold="$(fmt '{{range .Config.Env}}{{println .}}{{end}}' "$OLD" | /usr/bin/sed 's@^MCP_SERVER_URL=http://127.0.0.1:18787/mcp$@MCP_SERVER_URL=http://127.0.0.1:18788/mcp@' | LC_ALL=C /usr/bin/sort)"
enew="$(fmt '{{range .Config.Env}}{{println .}}{{end}}' "$NEW" | LC_ALL=C /usr/bin/sort)"
[ "$eold" = "$enew" ] || hold ENV_MISMATCH
# Strictly recognised original command layout; preserve image-supplied entrypoint.
cmdargs=()
entrycount="$(fmt '{{len .Config.Entrypoint}}' "$OLD")"
if [ "$entrycount" = 2 ]; then
  [ "$(fmt '{{index .Config.Entrypoint 1}}' "$OLD")" = run ] &&
  [ "$(fmt '{{json .Config.Cmd}}' "$OLD")" = '["--control-plane.api-key=file:/run/secrets/runtime-key"]' ] &&
  [ "$(fmt '{{json .Args}}' "$OLD")" = '["run","--control-plane.api-key=file:/run/secrets/runtime-key"]' ] ||
    hold COMMAND_LAYOUT
  cmdargs=(--control-plane.api-key=file:/run/secrets/runtime-key)
elif [ "$entrycount" = 1 ]; then
  [ "$(fmt '{{json .Config.Cmd}}' "$OLD")" = '["run","--control-plane.api-key=file:/run/secrets/runtime-key"]' ] &&
  [ "$(fmt '{{json .Args}}' "$OLD")" = '["run","--control-plane.api-key=file:/run/secrets/runtime-key"]' ] ||
    hold COMMAND_LAYOUT
  cmdargs=(run --control-plane.api-key=file:/run/secrets/runtime-key)
else
  hold COMMAND_LAYOUT
fi
actual_entry="$("$D" image inspect "$image" --format '{{json .Config.Entrypoint}}' 2>/dev/null)" ||
  hold IMAGE_ENTRYPOINT
[ "$actual_entry" = "$(fmt '{{json .Config.Entrypoint}}' "$OLD")" ] || hold IMAGE_ENTRYPOINT_CHANGED
userarg=()
user="$(fmt '{{.Config.User}}' "$OLD")"
if [ -n "$user" ]; then
  [[ "$user" =~ ^[1-9][0-9]*:[1-9][0-9]*$ ]] || hold USER_UNSAFE
  userarg=(--user "$user")
fi
# Copy only original's reviewed allowlisted non-secret env fields; do not print values.
envargs=()
seen_url=0
seen_id=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  [[ "$line" == *=* ]] || hold ENV_MALFORMED
  key="${line%%=*}"
  val="${line#*=}"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] && [ "${#val}" -lt 1400 ] || hold ENV_MALFORMED
  case "$key" in
    MCP_SERVER_URL)
      [ "$val" = http://127.0.0.1:18787/mcp ] || hold URL_MISMATCH
      val=http://127.0.0.1:18788/mcp; seen_url=$((seen_url+1));;
    CONTROL_PLANE_TUNNEL_ID)
      [[ "$val" =~ ^tunnel_[A-Za-z0-9_-]{8,150}$ ]] || hold TUNNEL_ID_FORMAT
      seen_id=$((seen_id+1));;
    PATH|HOME|LANG|LC_ALL|TZ|SSL_CERT_FILE|SSL_CERT_DIR|LOG_LEVEL|LOG_FORMAT|HEALTH_LISTEN_ADDR|HEALTH_URL_FILE|GODEBUG|GOTRACEBACK) ;;
    *) hold UNREVIEWED_ENV;;
  esac
  envargs+=(--env "$key=$val")
done < <("$D" inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$OLD")
[ "$seen_url" -eq 1 ] && [ "$seen_id" -eq 1 ] || hold REQUIRED_ENV
# Shared lock prevents parallel cutover/rollback attempts. No guard record means no switch.
[ ! -L "$DIR" ] || hold ROLLBACK_DIR_SYMLINK
if [ ! -d "$DIR" ]; then mkdir -m 700 "$DIR" || hold ROLLBACK_DIR_CREATION; fi
[ "$(stat -f %u "$DIR")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$DIR")" = 700 ] || hold ROLLBACK_DIR_PERMISSIONS
mkdir "$DIR/lock" 2>/dev/null || hold ALREADY_RUNNING
trap 'rmdir "$DIR/lock" >/dev/null 2>&1 || true' EXIT
[ ! -e "$GUARD" ] && [ ! -L "$GUARD" ] || hold ROLLBACK_GUARD_EXISTS
[ "$(fmt '{{.State.Running}}' "$OLD")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$NEW")" = false ] || hold STATE_CHANGED_BEFORE_REPAIR
say PRECONDITIONS_VERIFIED
# Remove *only* the known stopped candidate; preserve original and all mounts/files.
"$D" container rm "$NEW" >/dev/null 2>&1 || hold STOPPED_CANDIDATE_REMOVE_FAILED
if ! "$D" container create --name "$NEW" --network "container:$CANARY" \
  --mount "type=bind,source=$src,target=/run/secrets/runtime-key,readonly" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true --restart no \
  --pids-limit 64 --memory 128m \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
  "${userarg[@]+"${userarg[@]}"}" "${envargs[@]+"${envargs[@]}"}" \
  "$image" "${cmdargs[@]}" >/dev/null 2>&1; then
  hold CREATE_FAILED_ORIGINAL_UNTOUCHED
fi
[ "$(fmt '{{.State.Running}}' "$OLD")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$NEW")" = false ] || hold POST_REPAIR_STATE
newsrc="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$NEW")"
[ "$newsrc" = "$src" ] || hold REPAIRED_SOURCE_NOT_IDENTICAL
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if and (eq .Type "bind") (not .RW)}}yes{{end}}{{end}}{{end}}' "$NEW")" = yes ] || hold REPAIRED_KEY_NOT_READ_ONLY
[ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$NEW")" = true ] &&
[ "$(fmt '{{.HostConfig.Privileged}}' "$NEW")" = false ] &&
[ "$(fmt '{{.HostConfig.RestartPolicy.Name}}' "$NEW")" = no ] || hold POST_REPAIR_CONFINEMENT
[ ! -e "$GUARD" ] || hold UNEXPECTED_ROLLBACK_RECORD
say CANDIDATE_MOUNT_REPAIRED_STOPPED
say ORIGINAL_RUNNING_UNCHANGED
say NO_CUTOVER_NO_KEY_ATTESTATION
