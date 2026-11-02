#!/bin/bash
# ATLAS Observer Stage 3: read-only local tunnel topology preflight.
# No install, keys, container starts/stops, network edits, or plugin changes.
set -euo pipefail
umask 077
printf 'ATLAS_STAGE3_PREFLIGHT=STARTED\n'
hold() { printf 'ATLAS_STAGE3_PREFLIGHT=HOLD_%s\n' "$1"; exit 2; }
[ "${1:-}" = "--inspect-only" ] && [ "$#" -eq 1 ] || hold EXACT_SWITCH_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_REQUIRED
DOCKER=''
for d in /Applications/Docker.app/Contents/Resources/bin/docker /opt/homebrew/bin/docker /usr/local/bin/docker; do
  if [ -x "$d" ]; then DOCKER="$d"; break; fi
done
[ -n "$DOCKER" ] || hold DOCKER_CLI_MISSING
"$DOCKER" info >/dev/null 2>&1 || hold DOCKER_DAEMON_UNAVAILABLE

CANARY='atlas-mcp-readonly-canary'
TUNNEL='atlas-tunnel-client-canary'
OBSERVER='atlas-mcp-observer-review'
for name in "$CANARY" "$TUNNEL" "$OBSERVER"; do
  running=$("$DOCKER" inspect -f '{{.State.Running}}' "$name" 2>/dev/null) ||
    hold REQUIRED_CONTAINER_MISSING
  [ "$running" = true ] || hold REQUIRED_CONTAINER_NOT_RUNNING
done
CANARY_ID=$("$DOCKER" inspect -f '{{.Id}}' "$CANARY") || hold CANARY_INSPECT
for name in "$TUNNEL" "$OBSERVER"; do
  net=$("$DOCKER" inspect -f '{{.HostConfig.NetworkMode}}' "$name") ||
    hold NETWORK_INSPECT
  case "$net" in
    "container:$CANARY"|"container:$CANARY_ID") ;;
    *) hold UNEXPECTED_SHARED_NETWORK ;;
  esac
done
printf 'LOCAL_CONTAINERS=ALL_RUNNING_SHARED_PRIVATE_NAMESPACE\n'

# Inspect only exact boolean properties; never print full Docker inspect,
# Config.Env, Config.Cmd, Args, mount Sources, IDs or sensitive records.
image=$("$DOCKER" inspect -f '{{.Config.Image}}' "$TUNNEL") ||
  hold TUNNEL_IMAGE_INSPECT
[ "$image" = 'ghcr.io/openai/tunnel-client:v0.0.17' ] ||
  hold TUNNEL_VERSION_UNEXPECTED
root=$("$DOCKER" inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$TUNNEL") ||
  hold TUNNEL_SECURITY_INSPECT
priv=$("$DOCKER" inspect -f '{{.HostConfig.Privileged}}' "$TUNNEL") ||
  hold TUNNEL_SECURITY_INSPECT
restarts=$("$DOCKER" inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$TUNNEL") ||
  hold TUNNEL_SECURITY_INSPECT
ports=$("$DOCKER" inspect -f '{{json .HostConfig.PortBindings}}' "$TUNNEL") ||
  hold TUNNEL_SECURITY_INSPECT
[ "$root" = true ] && [ "$priv" = false ] && [ "$restarts" = no ] ||
  hold TUNNEL_CONFINEMENT_MISMATCH
[ "$ports" = null ] || [ "$ports" = '{}' ] || hold HOST_PORT_PUBLISHED
# Keep the original tunnel sealed too: the runtime key must be the sole RO bind.
# Inspect constants/counts only. Never expose source paths, key bytes or Docker Env.
tunnel_mount_count=$("$DOCKER" inspect -f '{{len .Mounts}}' "$TUNNEL") ||
  hold TUNNEL_MOUNT_COUNT_INSPECT
tunnel_key_mount=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if and (eq .Type "bind") (not .RW)}}yes{{end}}{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_KEY_MOUNT_TYPE_INSPECT
tunnel_drop=$("$DOCKER" inspect -f '{{range .HostConfig.CapDrop}}{{if eq . "ALL"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_CAP_DROP_INSPECT
tunnel_extra_caps=$("$DOCKER" inspect -f '{{len .HostConfig.CapAdd}}' "$TUNNEL") ||
  hold TUNNEL_CAP_ADD_INSPECT
tunnel_nnp=$("$DOCKER" inspect -f '{{range .HostConfig.SecurityOpt}}{{if or (eq . "no-new-privileges") (eq . "no-new-privileges:true")}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_NNP_INSPECT
[ "$tunnel_mount_count" = 1 ] && [ "$tunnel_key_mount" = yes ] &&
[ "$tunnel_drop" = yes ] && [ "$tunnel_extra_caps" = 0 ] &&
[ "$tunnel_nnp" = yes ] || hold TUNNEL_RUNTIME_ISOLATION_DRIFT
printf 'TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED\n'

# Independently validate the *existing* Stage 2 Observer's safe properties
# before ANY later tunnel cutover. These are inspect-only property matches:
# never reveal IDs, environment, mount sources, commands or key bytes.
observer_root=$("$DOCKER" inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$OBSERVER") ||
  hold OBSERVER_ROOT_INSPECT_FAILED
observer_priv=$("$DOCKER" inspect -f '{{.HostConfig.Privileged}}' "$OBSERVER") ||
  hold OBSERVER_PRIV_INSPECT_FAILED
observer_restart=$("$DOCKER" inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$OBSERVER") ||
  hold OBSERVER_RESTART_INSPECT_FAILED
observer_ports=$("$DOCKER" inspect -f '{{json .HostConfig.PortBindings}}' "$OBSERVER") ||
  hold OBSERVER_PORTS_INSPECT_FAILED
# User string must be a numeric, nonzero uid:gid (Stage 2 launch contract).
observer_user=$("$DOCKER" inspect -f '{{.Config.User}}' "$OBSERVER") ||
  hold OBSERVER_USER_INSPECT_FAILED
# The nonsecret Docker User contract is a numeric non-root uid:gid.
# Guard root uid AND root gid, usernames and empty values (none printed).
[[ "$observer_user" =~ ^[1-9][0-9]*:[1-9][0-9]*$ ]] ||
  hold OBSERVER_NONROOT_USER_NOT_VERIFIED
observer_caps=$("$DOCKER" inspect -f '{{range .HostConfig.CapDrop}}{{if eq . "ALL"}}yes{{end}}{{end}}' "$OBSERVER") ||
  hold OBSERVER_CAPS_INSPECT_FAILED
observer_source_ro=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/atlas-observer/scripts"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$OBSERVER") ||
  hold OBSERVER_SOURCE_MOUNT_INSPECT_FAILED
observer_snapshot_ro=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/run/atlas-observer"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$OBSERVER") ||
  hold OBSERVER_SNAPSHOT_MOUNT_INSPECT_FAILED
# The two expected RO binds must also be the ONLY Observer mounts.
observer_mount_count=$("$DOCKER" inspect -f '{{len .Mounts}}' "$OBSERVER") ||
  hold OBSERVER_MOUNT_COUNT_INSPECT_FAILED
# A rogue Docker socket or unrelated host directory invalidates isolation.
# Do not print mount destinations/sources, even on mismatch.
observer_extra_mounts=$("$DOCKER" inspect -f '{{range .Mounts}}{{if and (ne .Destination "/opt/atlas-observer/scripts") (ne .Destination "/run/atlas-observer")}}unexpected{{end}}{{end}}' "$OBSERVER") ||
  hold OBSERVER_MOUNT_ALLOWLIST_INSPECT_FAILED
observer_caps_added=$("$DOCKER" inspect -f '{{len .HostConfig.CapAdd}}' "$OBSERVER") ||
  hold OBSERVER_ADDED_CAPABILITIES_INSPECT_FAILED
observer_nnp=$("$DOCKER" inspect -f '{{range .HostConfig.SecurityOpt}}{{if or (eq . "no-new-privileges") (eq . "no-new-privileges:true")}}yes{{end}}{{end}}' "$OBSERVER") ||
  hold OBSERVER_NNP_INSPECT_FAILED
[ "$observer_root" = true ] && [ "$observer_priv" = false ] &&
[ "$observer_restart" = no ] &&
[ "$observer_caps" = yes ] &&
{ [ "$observer_ports" = null ] || [ "$observer_ports" = '{}' ]; } &&
[ "$observer_source_ro" = yes ] && [ "$observer_snapshot_ro" = yes ] &&
[ "$observer_mount_count" = 2 ] &&
[ -z "$observer_extra_mounts" ] && [ "$observer_caps_added" = 0 ] &&
[ "$observer_nnp" = yes ] ||
  hold OBSERVER_RUNTIME_ISOLATION_DRIFT
printf 'OBSERVER_EXISTING_READONLY_CONFINEMENT=VERIFIED\n'

# Compare only exact known-safe values inside Docker's Go template.
# Never emit raw argument/env values, mount Source, tunnel ID, or key content.
endpoint=$("$DOCKER" inspect -f '{{range .Args}}{{if eq . "--mcp.server-url=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_ARGS_CHECK_FAILED
# Actual owner-verified Docker deployment uses the restricted runtime-key
# file at this *container destination*. A previous draft mistakenly checked
# an example path from the never-deployed template.
# Query exact expected literals across Docker arg representations. The
# contents of Cmd/Entrypoint and the key itself are never printed.
keyfile_args=$("$DOCKER" inspect -f '{{range .Args}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_KEYFILE_ARGS_CHECK_FAILED
keyfile_cmd=$("$DOCKER" inspect -f '{{range .Config.Cmd}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_KEYFILE_CMD_CHECK_FAILED
keyfile_entry=$("$DOCKER" inspect -f '{{range .Config.Entrypoint}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_KEYFILE_ENTRY_CHECK_FAILED
mount=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$TUNNEL") ||
  hold KEY_MOUNT_CHECK_FAILED
endpoint_env=$("$DOCKER" inspect -f '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_ENV_CHECK_FAILED
[ "$endpoint" = yes ] || [ "$endpoint_env" = yes ] || hold EXPECTED_CANARY_ENDPOINT_NOT_VERIFIED
[ "$keyfile_args" = yes ] || [ "$keyfile_cmd" = yes ] || [ "$keyfile_entry" = yes ] ||
  hold FILE_BACKED_KEY_REFERENCE_NOT_VERIFIED
[ "$mount" = yes ] || hold READONLY_RUNTIME_KEY_MOUNT_NOT_VERIFIED
printf 'CURRENT_TUNNEL_TARGET=ORIGINAL_CANARY_18787\n'
printf 'RUNTIME_KEY=FILE_REFERENCED_READONLY_VALUE_NOT_READ\n'
printf 'OBSERVER_LOCAL_ENDPOINT=SEPARATE_REVIEW_18788\n'
printf 'PLATFORM_TUNNEL_ROLE=NOT_VERIFIED\n'
printf 'CHATGPT_PLUGIN_TOOL_DISCOVERY=NOT_REFRESHED\n'
printf 'CUTOVER=NOT_STARTED\n'
printf 'ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED\n'
