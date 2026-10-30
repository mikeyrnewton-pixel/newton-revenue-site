#!/bin/bash
# ATLAS / Mac headless: existing tunnel -> existing read-only Observer.
# This reuses the tested Stage3 bash contract, Docker and original tunnel.
# No Node, model, cloud service, raw key output or new scheduler.
set -euo pipefail
umask 077
MODE="$1"
[ "$#" -eq 1 ] || { echo "ATLAS=HOLD_SWITCH";exit 2; }
case "$MODE" in --preflight|--apply-readonly-observer|--rollback) ;; *) echo "ATLAS=HOLD_SWITCH";exit 2;; esac
hold(){ printf 'ATLAS=HOLD_%s\n' "$1";exit 2; }
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] || hold DOCKER_CLI_MISSING
"$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
OLD=atlas-tunnel-client-canary
NEW=atlas-tunnel-client-observer-candidate
CANARY=atlas-mcp-readonly-canary
SOURCE="$HOME/.atlas-observer-cutover-code/atlas-observer-stage3-preflight-20261024.sh"
DIR="$HOME/.atlas-observer-headless-rollback"
GUARD="$DIR/ids"
fmt(){ "$D" inspect --format "$1" "$2" 2>/dev/null || hold INSPECT_FAILED; }
validid(){ [[ "$1" =~ ^[a-f0-9]{64}$ ]] || hold ID_FORMAT; }
guarddir(){
  [ -d "$HOME" ] && [ ! -L "$HOME" ] || hold HOME_INVALID
  [ ! -L "$DIR" ] || hold GUARD_SYMLINK
  if [ ! -d "$DIR" ];then mkdir -m 700 "$DIR" || hold GUARD_CREATE;fi
  [ "$(stat -f %u "$DIR")" = "$(id -u)" ] &&
  [ "$(stat -f %Lp "$DIR")" = 700 ] || hold GUARD_PERMISSIONS
}
lockdir(){
  guarddir
  mkdir "$DIR/lock" 2>/dev/null || hold ALREADY_RUNNING
  trap 'rmdir "$DIR/lock" >/dev/null 2>&1 || true' EXIT
}
checkguard(){
  [ -f "$GUARD" ] && [ ! -L "$GUARD" ] &&
  [ "$(stat -f %u "$GUARD")" = "$(id -u)" ] &&
  [ "$(stat -f %Lp "$GUARD")" = 600 ] &&
  [ "$(stat -f %l "$GUARD")" = 1 ] || hold GUARD_INVALID
}
localcheck(){
  [ -f "$SOURCE" ] && [ ! -L "$SOURCE" ] || hold BASH_PREFLIGHT_MISSING
  [ "$(git hash-object "$SOURCE" 2>/dev/null)" = 3d06691eaf200e5be3669d8e35da0394c15fb628 ] ||
    hold BASH_PREFLIGHT_NOT_PINNED
  local status
  status="$(/bin/bash "$SOURCE" --inspect-only 2>&1)" || hold BASH_PREFLIGHT_BLOCKED
  [[ "$status" == *ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED* ]] ||
    hold BASH_PREFLIGHT_NOT_VERIFIED
  [ "$(fmt '{{.HostConfig.AutoRemove}}' "$OLD")" = false ] || hold ORIGINAL_REMOVAL_UNSAFE
  local key
  key="$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{.Source}}{{end}}{{end}}' "$OLD")"
  [ -n "$key" ] && [ -f "$key" ] && [ ! -L "$key" ] || hold KEY_PATH_UNSAFE
  [ "$(stat -f %u "$key")" = "$(id -u)" ] &&
  [ "$(stat -f %l "$key")" = 1 ] || hold KEY_OWNER_OR_LINK
  case "$(stat -f %Lp "$key")" in 600|400) ;; *) hold KEY_FILE_PERMISSIONS;; esac
  local image existing_entry actual_entry
  image="$(fmt '{{.Image}}' "$OLD")"
  [[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || hold IMAGE_NOT_PINNED
  existing_entry="$(fmt '{{json .Config.Entrypoint}}' "$OLD")"
  actual_entry="$("$D" image inspect "$image" --format '{{json .Config.Entrypoint}}' 2>/dev/null)" ||
    hold IMAGE_ENTRYPOINT_UNAVAILABLE
  [ "$existing_entry" = "$actual_entry" ] || hold CUSTOM_ENTRYPOINT
  [ "$(fmt '{{json .Config.Cmd}}' "$OLD")" = '["run","--control-plane.api-key=file:/run/secrets/runtime-key"]' ] ||
    hold CUSTOM_COMMAND
  echo "ATLAS=LOCAL_PREFLIGHT_VERIFIED_NODE_NOT_NEEDED"
  echo "ATLAS_KEY_ROLE=EXTERNAL_IDENTITY_ATTESTATION_REQUIRED"
  echo "ATLAS_TUNNEL=ORIGINAL_UNTOUCHED"
}
# Read original env into an array without printing secret-bearing fields.
envargs=()
readenv(){
  local data line key val seen_url=0 seen_id=0
  data="$(fmt '{{range .Config.Env}}{{println .}}{{end}}' "$OLD")"
  while IFS= read -r line;do
    [ -n "$line" ] || continue
    [[ "$line" == *=* ]] || hold ENV_MALFORMED
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] && [ "${#val}" -lt 1400 ] ||
      hold ENV_UNSAFE
    case "$key" in
      MCP_SERVER_URL)
        [ "$val" = http://127.0.0.1:18787/mcp ] || hold CURRENT_TARGET_CHANGED
        val=http://127.0.0.1:18788/mcp;seen_url=$((seen_url+1));;
      CONTROL_PLANE_TUNNEL_ID)
        [[ "$val" =~ ^tunnel_[A-Za-z0-9_-]{8,150}$ ]] || hold TUNNEL_ID_FORMAT
        seen_id=$((seen_id+1));;
      PATH|HOME|LANG|LC_ALL|TZ|SSL_CERT_FILE|SSL_CERT_DIR|LOG_LEVEL|LOG_FORMAT|HEALTH_LISTEN_ADDR|HEALTH_URL_FILE|GODEBUG|GOTRACEBACK) ;;
      *) hold UNREVIEWED_ENV;;
    esac
    envargs+=(--env "$key=$val")
  done <<< "$data"
  [ "$seen_url" -eq 1 ] && [ "$seen_id" -eq 1 ] || hold ENV_REQUIRED_FIELDS
}
saveguard(){
  local a b
  a="$(fmt '{{.Id}}' "$CANARY")"
  b="$(fmt '{{.Id}}' "$OLD")"
  validid "$a";validid "$b";validid "$1"
  (set -C;printf '%s\n%s\n%s\n' "$a" "$b" "$1" > "$GUARD") ||
    hold GUARD_ALREADY_PRESENT
  chmod 600 "$GUARD"
}
readguard(){
  checkguard
  local a b c extra
  IFS= read -r a < "$GUARD"
  b="$(sed -n '2p' "$GUARD")"
  c="$(sed -n '3p' "$GUARD")"
  extra="$(sed -n '4p' "$GUARD")"
  [ -z "$extra" ] || hold GUARD_EXTRA_FIELDS
  validid "$a";validid "$b";validid "$c"
  [ "$(fmt '{{.Id}}' "$CANARY")" = "$a" ] &&
  [ "$(fmt '{{.Id}}' "$OLD")" = "$b" ] &&
  [ "$(fmt '{{.Id}}' "$NEW")" = "$c" ] || hold GUARD_IDENTITY_MISMATCH
}
restore(){
  readguard
  [ "$(fmt '{{.State.Running}}' "$CANARY")" = true ] || hold CANARY_NOT_RUNNING
  if [ "$(fmt '{{.State.Running}}' "$NEW")" = true ];then
    "$D" container stop --time 10 "$NEW" >/dev/null 2>&1 || hold CANDIDATE_STOP_FAILED
  fi
  if [ "$(fmt '{{.State.Running}}' "$OLD")" != true ];then
    "$D" container start "$OLD" >/dev/null 2>&1 || hold ORIGINAL_RESTART_FAILED
  fi
  [ "$(fmt '{{.State.Running}}' "$OLD")" = true ] &&
  [ "$(fmt '{{.State.Running}}' "$NEW")" = false ] || hold RESTORE_NOT_VERIFIED
  "$D" container rm "$NEW" >/dev/null 2>&1 || hold CANDIDATE_REMOVE_FAILED
  rm "$GUARD"
  echo "ATLAS=ORIGINAL_CANARY_RESTORED"
  echo "ATLAS_REMOTE_PING=MUST_BE_INDEPENDENTLY_VERIFIED"
}
case "$MODE" in
  --preflight) localcheck ;;
  --rollback)
    lockdir
    restore ;;
  --apply-readonly-observer)
    [ "${ATLAS_REVIEWED_KEY_MATCH:-}" = YES ] &&
    [ "${ATLAS_WORKSPACE_MATCH:-}" = YES ] ||
      hold PLATFORM_ROLE_AND_WORKSPACE_NOT_CONFIRMED
    localcheck
    lockdir
    [ ! -e "$GUARD" ] && [ ! -L "$GUARD" ] || hold EXISTING_GUARD
    current_names="$("$D" container ls -a --format '{{.Names}}' 2>/dev/null)" ||
      hold CANDIDATE_LIST_FAILED
    if printf '%s\n' "$current_names" | grep -qx "$NEW";then hold CANDIDATE_ALREADY_EXISTS;fi
    readenv
    img="$(fmt '{{.Image}}' "$OLD")"
    user="$(fmt '{{.Config.User}}' "$OLD")"
    userarg=()
    if [ -n "$user" ];then
      [[ "$user" =~ ^[1-9][0-9]*:[1-9][0-9]*$ ]] || hold UNREVIEWED_TUNNEL_USER
      userarg=(--user "$user")
    fi
    # No Docker socket shared; only the incumbent's sole RO key mount.
    "$D" container create --name "$NEW" --network "container:$CANARY" \
      --volumes-from "$OLD:ro" --read-only --cap-drop ALL \
      --security-opt no-new-privileges:true --restart no \
      --pids-limit 64 --memory 128m \
      --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
      "${userarg[@]}" "${envargs[@]}" \
      "$img" run --control-plane.api-key=file:/run/secrets/runtime-key >/dev/null 2>&1 ||
        hold CANDIDATE_CREATION_FAILED
    cid="$(fmt '{{.Id}}' "$NEW")";validid "$cid"
    [ "$(fmt '{{.State.Running}}' "$NEW")" = false ] &&
    [ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$NEW")" = true ] &&
    [ "$(fmt '{{.HostConfig.Privileged}}' "$NEW")" = false ] &&
    [ "$(fmt '{{.HostConfig.NetworkMode}}' "$NEW")" = "container:$CANARY" ] &&
    [ "$(fmt '{{len .Mounts}}' "$NEW")" = 1 ] &&
    [ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$NEW")" = yes ] &&
    [ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18788/mcp"}}yes{{end}}{{end}}' "$NEW")" = yes ] ||
      hold CANDIDATE_CONFINEMENT_NO_SWITCH
    saveguard "$cid"
    "$D" container stop --time 10 "$OLD" >/dev/null 2>&1 || hold ORIGINAL_STOP_FAILED
    "$D" container start "$NEW" >/dev/null 2>&1 || {
       restore;hold CANDIDATE_START_FAILED_ORIGINAL_RESTORED;
    }
    [ "$(fmt '{{.State.Running}}' "$NEW")" = true ] &&
    [ "$(fmt '{{.State.Running}}' "$OLD")" = false ] || {
       restore;hold CANDIDATE_NOT_RUNNING_ORIGINAL_RESTORED;
    }
    echo "ATLAS=LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED"
    echo "ATLAS_ORIGINAL=STOPPED_AND_PRESERVED"
    echo "ATLAS_ROLLBACK=AVAILABLE" ;;
esac
