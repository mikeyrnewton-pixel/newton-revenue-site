# ATLAS Observer — authorised owner-side cutover runbook (29 Oct 2026)

**Owner's scope approved in chat:** Replace the original Mac tunnel target from
the fixed harmless 18787 canary to the existing **read-only** local Observer
18788, with strict role/workspace checks and a way to restore the original.
Approval does **not** authorise remote shell exposure, unrestricted Mac file
access, automatic service repairs, extra API expenditure, email outreach,
financial activity, or a tunnel/application credential rotation.

**Status at writing:** SOURCE+CI only. The assistant's actual available private
Mac connector still exposes solely `atlas_ping` and returns the fixed token
`ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`; it cannot execute SSH or Docker
commands. On 27 Oct the owner separately verified the Mac Stage 4 *read-only
inspection* as `REVIEW_READY_NO_CHANGES`, with original container
`AutoRemove=false`. The owner also viewed a Platform key restricted to
Tunnels **Read+Use**, but its identity has **not yet been matched to the
actual file-backed key in the running container**. Workspace linkage must
be confirmed against the exact installed ChatGPT plugin.

## What's actually built and offline tested

The source `scripts/atlas-observer-cutover-operator.mjs` reuses the original
`scripts/atlas-tunnel-cutover-contract-20261026.mjs` immutable read-only
security checks. It has three exact modes:

- `--preflight`: inspect-only (Docker metadata + file permissions) and
  emit a fixed, sanitized readiness contract; no writes, tunnel disruptions
  or credential bytes inspected.
- `--apply-readonly-observer`: **only when the owner has actually confirmed
  the mounted key is the restricted reviewed key AND the workspace matches**.
  It creates a candidate tunnel using the exact pinned local image ID,
  original file-backed key reference, reviewed environment and shared
  private namespace. It does not run a second tunnel concurrently:
  it first prepares the candidate **stopped**, writes a private 0600
  rollback guard, stops the original container (AutoRemove=false), then
  starts the candidate. The original stays intact and stopped with
  its original name. All Docker output and credentials are suppressed.
  It checks candidate confinement after create, IDs before shutdown
  and states after transition. If activation fails, it attempts to restore
  the original and cleans the failed staged candidate.
- `--rollback`: checks private rollback guard, exact container IDs and
  names; stops the observer candidate before restarting the original
  canary tunnel; removes only the exact stopped candidate on successful
  restoration. Other services are untouched.

**Important:** a successful LOCAL cutover still prints
`remoteAtlasStatus=NOT_VERIFIED`. It is not proof of the ChatGPT app's
current MCP tool discovery, a fresh snapshot, safe remote app permissions
or the Mac remaining awake. There is no automatic rollback timer; if
the owner loses the new app connection, the independent existing iPhone
SSH shortcut remains the route to invoke `--rollback`. If the host dies
mid-step, the private guard persists for owner recovery, but no host
uptime or watchdog-on-boot guarantee is claimed. Do not run while Mac
availability/SSH is uncertain.

## Owner iPhone Shortcut — immutable, download-verified preflight

Use the EXISTING **Run Script Over SSH** shortcut to the Mac, rather than
enabling a new remote terminal or pasting credentials. The two files are
public source code only. SHA-1 values below are Git *blob* hashes, not
tunnel secrets; `git hash-object` verifies exact bytes before Node loads
them.

Pinned source commit:
`2fb838d54439a009420f37fe412ac952bdba8ca2`

- operator `scripts/atlas-observer-cutover-operator.mjs`: Git blob
  `411451b0312db462c9dbc1e9bfc8f8c1fe99c1db`
- baseline contract `scripts/atlas-tunnel-cutover-contract-20261026.mjs`:
  `cabb212c842bc482cdfb5f4cead7fe8b1f9a5e6d`

~~~bash
set -eu
umask 077
d="$HOME/.atlas-observer-cutover-code"
test ! -L "$d"
mkdir -p "$d"
chmod 700 "$d"
base="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/2fb838d54439a009420f37fe412ac952bdba8ca2/scripts"
for f in atlas-observer-cutover-operator.mjs atlas-tunnel-cutover-contract-20261026.mjs; do
  tmp="$(mktemp "$d/.source.XXXXXXXX")"
  curl -fsSL --max-time 30 "$base/$f" -o "$tmp"
  mv -f "$tmp" "$d/$f"
  chmod 600 "$d/$f"
done
test "$(git hash-object "$d/atlas-observer-cutover-operator.mjs")" = "411451b0312db462c9dbc1e9bfc8f8c1fe99c1db"
test "$(git hash-object "$d/atlas-tunnel-cutover-contract-20261026.mjs")" = "cabb212c842bc482cdfb5f4cead7fe8b1f9a5e6d"
# iPhone SSH sessions can have a minimal PATH and Node can live under NVM,
# Volta, Mise or FNM rather than /opt/homebrew/bin.
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for p in "$HOME/.volta/bin/node" "$HOME/.n/bin/node" "/usr/local/opt/node/bin/node"; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  for dir in "$HOME/.nvm/versions/node" "$HOME/.local/share/mise/installs/node" "$HOME/.fnm/node-versions"; do
    if [ -d "$dir" ]; then
      NODE="$(find "$dir" -type f -name node -print -quit 2>/dev/null || true)"
      if [ -n "$NODE" ]; then break; fi
    fi
  done
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "NODE_NOT_FOUND_NO_MAC_CHANGE"
  exit 2
fi
"$NODE" "$d/atlas-observer-cutover-operator.mjs" --preflight
~~~

Expected useful result:
`"status":"REVIEWED_RECONSTRUCTION_NO_WRITES"`.
Any `HOLD_...`, error, missing key permissions, unexpected image or
mismatched Docker metadata means **STOP; do not proceed**. No secret bytes,
paths, IDs or Docker raw output need be shared with ChatGPT.

## Apply — ONLY after identity and workspace truly matched

This command is an explicit owner-side attestation, not a way to bypass an
unknown or unsafe key. The separate fact that a Platform screenshot showed
*some* API key with Read+Use does **not** by itself prove which key is mounted.

~~~bash
set -eu
d="$HOME/.atlas-observer-cutover-code"
# iPhone SSH sessions can have a minimal PATH and Node can live under NVM,
# Volta, Mise or FNM rather than /opt/homebrew/bin.
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for p in "$HOME/.volta/bin/node" "$HOME/.n/bin/node" "/usr/local/opt/node/bin/node"; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  for dir in "$HOME/.nvm/versions/node" "$HOME/.local/share/mise/installs/node" "$HOME/.fnm/node-versions"; do
    if [ -d "$dir" ]; then
      NODE="$(find "$dir" -type f -name node -print -quit 2>/dev/null || true)"
      if [ -n "$NODE" ]; then break; fi
    fi
  done
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "NODE_NOT_FOUND_NO_MAC_CHANGE"
  exit 2
fi
ATLAS_REVIEWED_KEY_MATCH=YES ATLAS_WORKSPACE_MATCH=YES   "$NODE" "$d/atlas-observer-cutover-operator.mjs" --apply-readonly-observer
~~~

Expected local result:
`LOCAL_CUTOVER_STARTED_REMOTE_STATUS_NOT_VERIFIED`. The active tunnel
container is a separate read-only-candidate, and original is retained
stopped. This has NOT been run by the assistant.

## Independently verify ChatGPT, then rehearse rollback

Open ChatGPT Plugins, check the ATLAS custom MCP plugin uses the existing
tunnel and the intended workspace. Depending on the product UI, existing
plugin tool discovery may require reconnecting or creating a new custom
MCP plugin from the **same** tunnel; do not create a new Platform tunnel
or new API key as a shortcut. OpenAI's official Secure MCP Tunnel guide
describes ChatGPT Plugins → Add custom MCP server → Tunnel. Verify the
actual plugin exposes exactly `atlas_ping`, `atlas_capabilities` and
`atlas_status`, with zero arguments each. Only a **genuine** ChatGPT
`atlas_status` invocation returning allowlisted **FRESH** status within
the five-minute limit and matching Mac-local snapshot evidence completes
remote observability. `atlas_ping` alone is insufficient.

Official docs:
https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
https://github.com/openai/tunnel-client/blob/master/docs/permissions.md

If tools are absent, freshness is stale, unexpected fields appear or the
connection fails, use the independently working iPhone SSH shortcut:

~~~bash
set -eu
d="$HOME/.atlas-observer-cutover-code"
# iPhone SSH sessions can have a minimal PATH and Node can live under NVM,
# Volta, Mise or FNM rather than /opt/homebrew/bin.
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for p in "$HOME/.volta/bin/node" "$HOME/.n/bin/node" "/usr/local/opt/node/bin/node"; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  for dir in "$HOME/.nvm/versions/node" "$HOME/.local/share/mise/installs/node" "$HOME/.fnm/node-versions"; do
    if [ -d "$dir" ]; then
      NODE="$(find "$dir" -type f -name node -print -quit 2>/dev/null || true)"
      if [ -n "$NODE" ]; then break; fi
    fi
  done
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "NODE_NOT_FOUND_NO_MAC_CHANGE"
  exit 2
fi
"$NODE" "$d/atlas-observer-cutover-operator.mjs" --rollback
~~~

Expected local rollback:
`LOCAL_ROLLBACK_ORIGINAL_CANARY_RUNNING`. Then independently call the
ChatGPT canary `atlas_ping`, expecting the fixed
`ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS`. This validates recovery of
old communication, **not** current Mac health. After a successful
rollback rehearsal, do not silently reapply without reconfirming the
current local preflight; the final Observer connection should pass all
the same checks.

## Scope boundaries

- **No** existing Watchdog, Continuation, Activepieces, Qwen, trading desk,
  sales workers or hourly automation schedules are modified by this handoff.
- **No** broad shell, Docker socket, secrets or customer files are exposed
  through MCP; Observer remains limited to the three documented fixed tools.
- **No** production merge, new subscription, email, live trade or expenditure.
- Mac sleep/maintenance wake cycle remains a separate availability issue.
- **No completion claim** until real Mac operator receipt + real remote
  ChatGPT status and rollback have actually been observed.

Tests use mocked Docker and temp directories. Current evidence does not
include actual execution of this new operator on the owner's Mac.


## 29 October 2026, 09:26 UK — iPhone SSH Node PATH correction

The owner ran the pinned original preflight staging Shortcut. It reached
`zsh:17: no such file or directory: /opt/homebrew/bin/node`. Because
`set -eu` was active and the fallback Node executable was the final
step, source downloads and preceding `git hash-object` assertions appear
to have passed; **there was no Node execution, no Docker inspection and
no cutover**. SSH transport itself was working. No keys or passwords are
needed for troubleshooting.

Corrective action: re-run only the short existing-directory read-only
preflight with the robust Node lookup below. Do **not** re-download or
overwrite verified sources.

~~~bash
set -eu
d="$HOME/.atlas-observer-cutover-code"
test "$(git hash-object "$d/atlas-observer-cutover-operator.mjs")" = "411451b0312db462c9dbc1e9bfc8f8c1fe99c1db"
test "$(git hash-object "$d/atlas-tunnel-cutover-contract-20261026.mjs")" = "cabb212c842bc482cdfb5f4cead7fe8b1f9a5e6d"
# iPhone SSH sessions can have a minimal PATH and Node can live under NVM,
# Volta, Mise or FNM rather than /opt/homebrew/bin.
PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for p in "$HOME/.volta/bin/node" "$HOME/.n/bin/node" "/usr/local/opt/node/bin/node"; do
    if [ -x "$p" ]; then NODE="$p"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  for dir in "$HOME/.nvm/versions/node" "$HOME/.local/share/mise/installs/node" "$HOME/.fnm/node-versions"; do
    if [ -d "$dir" ]; then
      NODE="$(find "$dir" -type f -name node -print -quit 2>/dev/null || true)"
      if [ -n "$NODE" ]; then break; fi
    fi
  done
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "NODE_NOT_FOUND_NO_MAC_CHANGE"
  exit 2
fi
"$NODE" "$d/atlas-observer-cutover-operator.mjs" --preflight
~~~

If `NODE_NOT_FOUND_NO_MAC_CHANGE` appears, stop; locate or install a
trusted local Node runtime as a separate software decision. Do not
replace this check with a random remote script, broaden Docker privileges,
or try the `--apply-readonly-observer` mode until preflight passes and
the *mounted* runtime key is actually matched to the reviewed restricted
permission record and workspace.
