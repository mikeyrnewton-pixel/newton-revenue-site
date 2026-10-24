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
printf 'TUNNEL_IMAGE_AND_RUNTIME_CONFINEMENT=VERIFIED\n'

# Compare literal known expected argv flag *inside* Docker's Go template:
# emit only "yes" or empty, never capture or print arguments or key content.
endpoint=$("$DOCKER" inspect -f '{{range .Args}}{{if eq . "--mcp.server-url=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_ARGS_CHECK_FAILED
keyfile=$("$DOCKER" inspect -f '{{range .Args}}{{if eq . "--control-plane.api-key=file:/run/secrets/openai_runtime_key"}}yes{{end}}{{end}}' "$TUNNEL") ||
  hold TUNNEL_KEYFILE_CHECK_FAILED
mount=$("$DOCKER" inspect -f '{{range .Mounts}}{{if eq .Destination "/run/secrets/openai_runtime_key"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$TUNNEL") ||
  hold KEY_MOUNT_CHECK_FAILED
[ "$endpoint" = yes ] || hold EXPECTED_CANARY_ENDPOINT_NOT_VERIFIED
[ "$keyfile" = yes ] && [ "$mount" = yes ] ||
  hold FILE_BACKED_READONLY_KEY_NOT_VERIFIED
printf 'CURRENT_TUNNEL_TARGET=ORIGINAL_CANARY_18787\n'
printf 'RUNTIME_KEY=FILE_REFERENCED_READONLY_VALUE_NOT_READ\n'
printf 'OBSERVER_LOCAL_ENDPOINT=SEPARATE_REVIEW_18788\n'
printf 'PLATFORM_TUNNEL_ROLE=NOT_VERIFIED\n'
printf 'CHATGPT_PLUGIN_TOOL_DISCOVERY=NOT_REFRESHED\n'
printf 'CUTOVER=NOT_STARTED\n'
printf 'ATLAS_STAGE3_PREFLIGHT=LOCAL_TOPOLOGY_VERIFIED\n'
