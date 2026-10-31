#!/bin/bash
# ATLAS read-only classification of the existing tunnel command.
# DO NOT print raw Docker Cmd, Args, Env, IDs, mount paths or key material.
# Independent operator diagnostic ONLY. No cutover, repair or privilege changes.
set -euo pipefail
umask 077
hold(){ printf 'ATLAS_CMD_DIAG=HOLD_%s\n' "$1"; exit 2; }
[ "$#" -eq 1 ] && [ "$1" = "--inspect-only" ] || hold EXACT_FLAG_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] || hold DOCKER_CLI_MISSING
"$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
T=atlas-tunnel-client-canary
probe(){ "$D" inspect --format "$1" "$T" 2>/dev/null || hold TUNNEL_INSPECT_FAILED; }
[ "$(probe '{{.State.Running}}')" = true ] || hold ORIGINAL_NOT_RUNNING
[ "$(probe '{{.HostConfig.ReadonlyRootfs}}')" = true ] || hold TUNNEL_NOT_READONLY
[ "$(probe '{{.HostConfig.Privileged}}')" = false ] || hold TUNNEL_PRIVILEGED
[ "$(probe '{{len .Mounts}}')" = 1 ] || hold TUNNEL_UNEXPECTED_MOUNTS
[ "$(probe '{{range .Mounts}}{{if eq .Destination "/run/secrets/runtime-key"}}{{if not .RW}}yes{{end}}{{end}}{{end}}')" = yes ] || hold KEY_NOT_READONLY
# Docker renders Go templates inside its process; the following outputs are
# ONLY literal yes/no/other and numeric lengths. No raw launch text leaves Docker.
flag(){
  local result
  result="$(probe "$2")"
  if [ "$result" = yes ]; then
    printf 'ATLAS_CMD_DIAG_%s=YES\n' "$1"
  else
    printf 'ATLAS_CMD_DIAG_%s=NO\n' "$1"
  fi
}
count(){
  local value
  value="$(probe "$2")"
  [[ "$value" =~ ^[0-9]{1,2}$ ]] || hold UNEXPECTED_COUNT
  printf 'ATLAS_CMD_DIAG_%s=%s\n' "$1" "$value"
}
count CMD_ITEMS '{{len .Config.Cmd}}'
count ENTRY_ITEMS '{{len .Config.Entrypoint}}'
count ARGS_ITEMS '{{len .Args}}'
flag CMD_RUN '{{range .Config.Cmd}}{{if eq . "run"}}yes{{end}}{{end}}'
flag CMD_KEYFILE '{{range .Config.Cmd}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}'
flag CMD_ENDPOINT '{{range .Config.Cmd}}{{if eq . "--mcp.server-url=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}'
flag CMD_UNRECOGNISED '{{range .Config.Cmd}}{{if and (ne . "run") (ne . "--control-plane.api-key=file:/run/secrets/runtime-key") (ne . "--mcp.server-url=http://127.0.0.1:18787/mcp")}}yes{{end}}{{end}}'
flag ENTRY_RUN '{{range .Config.Entrypoint}}{{if eq . "run"}}yes{{end}}{{end}}'
flag ENTRY_KEYFILE '{{range .Config.Entrypoint}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}'
flag ENTRY_UNRECOGNISED '{{range .Config.Entrypoint}}{{if and (ne . "run") (ne . "--control-plane.api-key=file:/run/secrets/runtime-key") (ne . "/tunnel-client") (ne . "tunnel-client")}}yes{{end}}{{end}}'
flag ARGS_RUN '{{range .Args}}{{if eq . "run"}}yes{{end}}{{end}}'
flag ARGS_KEYFILE '{{range .Args}}{{if eq . "--control-plane.api-key=file:/run/secrets/runtime-key"}}yes{{end}}{{end}}'
flag ARGS_ENDPOINT '{{range .Args}}{{if eq . "--mcp.server-url=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}'
flag ENV_ENDPOINT '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18787/mcp"}}yes{{end}}{{end}}'
echo ATLAS_CMD_DIAG=READ_ONLY_CLASSIFICATION_COMPLETE_NO_CUTOVER
