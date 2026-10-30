# ATLAS — finish the Mac ↔ ChatGPT read-only Observer connection

**Status, 30 October 2026:** Source-only upgrade. No Mac-side switch has
occurred in this chat. The assistant's installed private Mac app exposes only
\`atlas_ping\` returning \`ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS\`.
That fixed response itself does not prove fresh Mac data or tunnel polling.

The owner has authorised the scoped reversible 18787 canary → 18788 read-only
Observer target cutover. The Mac has a broken screen, so all Mac actions use
the owner's pre-existing iPhone *Run Script over SSH* connection. Do not
install Node, subscribe to another model, create a new tunnel, rotate keys,
enable shell access or widen Mac/server permissions.

## Already completed by assistant

- The original Stage3 Bash preflight and separate headless cutover/rollback
  operator are pinned at source commit
  \`7abf51722e05a272d0b39bd7e415971c86716df0\`.
- The operator source SHA-1 Git blob
  \`0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5\` and Stage3 contract
  SHA-1 Git blob \`3d06691eaf200e5be3669d8e35da0394c15fb628\`
  were confirmed from the GitHub repository.
- To avoid long iPhone copy/paste errors, a **new one-step bootstrap**
  \`scripts/atlas-observer-owner-bootstrap-20261030.sh\` at source commit
  \`6bb80ef863c11079a476779d431ef809fb4af8dc\`, Git blob SHA-1
  \`5408a0f14140f5d426df95e1ea9b923ef4ee1db0\`, safely stages and
  hash-checks both older scripts, then performs **only** the read-only
  Mac preflight. No container starts, stops or plugin changes.
- GitHub offline review branch CI on that commit: **342/342 passing**.
  This is NOT evidence of real Mac execution or live remote status.

## Owner's FIRST final action — one SSH paste

Open the existing iPhone Shortcut's *Run Script over SSH* action, replace
the entire Script field with this ONLY:

~~~bash
set +e
tmp="$(mktemp /tmp/atlas-bootstrap.XXXXXXXX)"
url="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/6bb80ef863c11079a476779d431ef809fb4af8dc/scripts/atlas-observer-owner-bootstrap-20261030.sh"
if [ -z "$tmp" ] || ! /usr/bin/curl -fsSL --max-time 30 "$url" -o "$tmp"; then
  echo ATLAS=BOOTSTRAP_DOWNLOAD_FAILED
else
  if [ "$(/usr/bin/git hash-object "$tmp" 2>/dev/null)" != "5408a0f14140f5d426df95e1ea9b923ef4ee1db0" ]; then
    echo ATLAS=BOOTSTRAP_HASH_MISMATCH
  else
    /bin/bash "$tmp"
    echo "ATLAS_BOOTSTRAP_EXIT=$?"
  fi
  rm -f "$tmp"
fi
echo ATLAS=DIAGNOSTIC_FINISHED
exit 0
~~~

This intentionally returns shell code 0 at the end so the iPhone Shortcut's
output panel displays the actual \`ATLAS_BOOTSTRAP=...\` and \`ATLAS=HOLD_...\`
lines instead of a generic red failure. That zero is **NOT** proof
preflight passed. Expected real positive:
\`ATLAS=LOCAL_PREFLIGHT_VERIFIED_NODE_NOT_NEEDED\` plus
\`ATLAS_BOOTSTRAP=READ_ONLY_PREFLIGHT_RETURNED_SUCCESS\`.

If any \`HOLD_...\`, an unexpected error, file hash mismatch, or no
positive status appears: **STOP**, return only sanitized lines, and do not
run any cutover/apply command.

## Owner's SECOND final action — restricted access identity

Before any cutover, confirm in the connected Platform organization's tunnel
settings that the **existing runtime credential used by the Mac** is the
restricted Tunnels Read+Use credential, and that the **same existing tunnel**
is linked with the intended ChatGPT workspace/plugin. This is a **metadata
check**. Do not copy the credential, display it, hash its bytes, send secret
IDs or paste sensitive Docker inspect data to chat.

The live original canary being locally running is not enough to verify
credential identity or polling; the fixed \`atlas_ping\` response is
not evidence of Mac access. Retain the independent iPhone SSH path throughout
so rollback never depends on the custom ATLAS plugin being up.

## Controlled cutover ONLY if both steps passed

The existing owner-approved operator supports
\`--apply-readonly-observer\` and \`--rollback\` from the same pinned path.
See \`docs/ATLAS_OBSERVER_HEADLESS_NO_NODE_20261029.md\` for the precise,
separately reviewed local apply and rollback commands.

A local apply **preserves the original tunnel container**. A locally
successful status \`ATLAS=LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED\`
only establishes Docker state, NOT the ChatGPT tool list or a fresh Mac
snapshot. If apply fails or remote status cannot be verified, rollback
using the iPhone SSH connection; never attempt to change Docker manually
based on guessed IDs.

## Third final action — refresh the custom ATLAS plugin tools

**Important new finding:** MCP tool metadata can remain cached after the
server changes. After the tunnel successfully points to the read-only
Observer, open **ChatGPT web → Plugins → existing ATLAS private Mac
connection → Refresh**, when the control is available. Check that only
\`atlas_ping\`, \`atlas_capabilities\` and \`atlas_status\` are advertised
and no shell/write/secret tool appeared. Start a new ChatGPT conversation
if required by the plugin UI. **Don't delete or recreate the existing
plugin by default.** Custom MCP plugin administration may be web-only,
so the owner's iPhone browser (request desktop site if necessary) is the
fallback to the damaged Mac display.

Official OpenAI guidance:
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels

Use the resulting \`atlas_status\` tool to inspect a **fresh timestamped
allowlisted status**. Only then call ChatGPT ↔ Mac Observer **LIVE**.
If the tool isn't discovered, the status is stale, or errors persist,
restore the original preserved canary via owner iPhone SSH. The original
Watchdog, Continuation, Activepieces, Qwen, sales and paper trading services
must remain unchanged.

## What is explicitly NOT authorised by this handoff

No broad Mac terminal/shell through MCP, arbitrary files/credentials,
automatic service repair, new paid subscriptions, customer outreach,
real-money trading, publication, contract or production merge.
