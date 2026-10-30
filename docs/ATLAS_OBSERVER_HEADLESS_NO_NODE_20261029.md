# ATLAS Observer — Node-free iPhone SSH cutover option (29 Oct 2026)

This document supersedes the **Node lookup** step in the original Mac
cutover handoff. Mac has a broken screen and SSH via iPhone is functioning.
On 29 Oct the owner independently confirmed all three original Docker
containers RUNNING and the tunnel's private shared network, read-only root,
non-privileged mode, read-only key bind, preserved AutoRemove=false original
and current fixed canary URL. These DO NOT prove API-key identity or remote
access to the local read-only Observer.

## What remains true
- **No direct ChatGPT-to-Mac shell access**: the connected custom app still
  only exposes \`atlas_ping\` and returns the static
  \`ATLAS_TUNNEL_CANARY_OK_NO_MAC_ACCESS\`.
- No installation, subscription or changes to the working tunnel have been
  performed by the assistant. The owner already authorised a **reversible
  read-only target cutover**; it did not grant broader host access.
- Stage3 read-only preflight and new Bash operator are all local Mac files;
  **they must be staged through the working iPhone SSH Shortcut**.
- Before applying, owner must *truly* verify the **same currently mounted**
  runtime key is the restricted Platform **Tunnels Read+Use** key (not
  Manage/full access) and the exact ChatGPT workspace/plugin identity matches.
  An arbitrary \`YES\` would not create proof. Do not print, paste, copy,
  hash or disclose the key itself or the tunnel identity.

## Pinned, verified source inputs

Repository: \`mikeyrnewton-pixel/newton-revenue-site\`

Operator commit: \`7abf51722e05a272d0b39bd7e415971c86716df0\`

Operator file:
\`scripts/atlas-observer-headless-cutover-20261029.sh\`

Expected operator **Git blob** hash:
\`0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5\`

Existing Stage3 Bash preflight file:
\`scripts/atlas-observer-stage3-preflight-20261024.sh\`

Expected Stage3 **Git blob** hash:
\`3d06691eaf200e5be3669d8e35da0394c15fb628\`

The operator invokes the original Bash preflight and adds strict command
reconstruction checks, owner-key file permissions, original image ID and
entrypoint consistency checks. It uses ONLY an existing Docker CLI and the
original pinned tunnel image. No Node or new model download. The operator
is deliberately conservative: unknown env variables, unexpected launch
flags or security drift cause **HOLD**. This is not a bypass of the
more extensive reviewed Node operator.

## One iPhone Shortcut — stage and perform read-only local preflight

Replace the **entire** content of the Shortcut's Run Script over SSH **Script**
field with the below. Copy ONLY the shell code, not the surrounding prose.
There is no need to operate the Mac's damaged screen.

~~~bash
set -eu
umask 077
d="$HOME/.atlas-observer-cutover-code"
test ! -L "$d"
mkdir -p "$d"
chmod 700 "$d"
base="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/7abf51722e05a272d0b39bd7e415971c86716df0/scripts"
for f in atlas-observer-headless-cutover-20261029.sh atlas-observer-stage3-preflight-20261024.sh;do
  tmp="$(mktemp "$d/.verified.XXXXXXXX")"
  if ! curl -fsSL --max-time 30 "$base/$f" -o "$tmp";then
    echo ATLAS=HOLD_DOWNLOAD
    exit 0
  fi
  mv -f "$tmp" "$d/$f"
  chmod 600 "$d/$f"
done
if [ "$(git hash-object "$d/atlas-observer-headless-cutover-20261029.sh")" != "0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5" ];then
  echo ATLAS=HOLD_OPERATOR_HASH
  exit 0
fi
if [ "$(git hash-object "$d/atlas-observer-stage3-preflight-20261024.sh")" != "3d06691eaf200e5be3669d8e35da0394c15fb628" ];then
  echo ATLAS=HOLD_STAGE3_HASH
  exit 0
fi
echo ATLAS=SOURCE_HASHES_VERIFIED
/bin/bash "$d/atlas-observer-headless-cutover-20261029.sh" --preflight || true
echo ATLAS=READONLY_CHECK_ENDED
~~~

Expected: \`ATLAS=SOURCE_HASHES_VERIFIED\`,
\`ATLAS=LOCAL_PREFLIGHT_VERIFIED_NODE_NOT_NEEDED\`,
\`ATLAS_KEY_ROLE=EXTERNAL_IDENTITY_ATTESTATION_REQUIRED\`,
\`ATLAS_TUNNEL=ORIGINAL_UNTOUCHED\`.

Any \`ATLAS=HOLD_...\` means **STOP**. The script never tries to switch.
If \`HOLD_CUSTOM_COMMAND\` or \`HOLD_CUSTOM_ENTRYPOINT\` appears, investigate
the difference locally rather than inventing or overriding launch flags.
No sensitive IDs/paths/key bytes should be printed.

## Apply ONLY after both identity facts have been checked

This is **not authorised by merely running preflight**. Verify key/workspace
identity via Platform setup and the existing custom Plugin first. When those
two facts are independently confirmed, the user may run:

~~~bash
set -eu
d="$HOME/.atlas-observer-cutover-code"
test "$(git hash-object "$d/atlas-observer-headless-cutover-20261029.sh")" = "0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5"
ATLAS_REVIEWED_KEY_MATCH=YES ATLAS_WORKSPACE_MATCH=YES \
  /bin/bash "$d/atlas-observer-headless-cutover-20261029.sh" --apply-readonly-observer
~~~

The operator creates a **separate stopped candidate**, confined to the
original's read-only key mount and private network. It saves the original's
and candidate's identities under a private 0700 guard directory and a 0600
file; stops the existing tunnel, then starts the candidate. It preserves
the old AutoRemove=false container and does not reconfigure other Docker
services. If candidate startup fails, the script attempts the original
restart. If Docker/container state changes unexpectedly, **STOP** rather
than broaden commands.

A successful local output is
\`ATLAS=LOCAL_CUTOVER_STARTED_REMOTE_NOT_VERIFIED\`.
It does **not** prove ChatGPT knows the new tool schema. The custom plugin
must be refreshed as appropriate; only a real \`atlas_status\` call with
fresh constrained evidence proves remote observability. Tool discovery
should match the intended 3 read-only actions and no shell/secret access.

## Rollback from the same iPhone SSH Shortcut

If the custom plugin loses connection, returns only the canary, has stale
status or exposes unexpected tools, use the existing **independent**
iPhone SSH connection (not the possibly disconnected custom MCP) to run:

~~~bash
set -eu
d="$HOME/.atlas-observer-cutover-code"
test "$(git hash-object "$d/atlas-observer-headless-cutover-20261029.sh")" = "0b45a664b48f2538b9d9bbb73089b2a1b0e52bd5"
/bin/bash "$d/atlas-observer-headless-cutover-20261029.sh" --rollback
~~~

It checks identity matches before changing containers, stops the candidate
before restarting the original and removes only the verified stopped
candidate. After rollback, \`atlas_ping\` should again return the existing
fixed canary token. No automatic timeout rollback is installed; retain SSH
access and avoid changing power/sleep settings during handoff.

## Known limitations and release status

- The original Node operator has a separately tested synthetic Docker
  lifecycle/rollback suite; the Bash fallback has a syntax/switch/security
  contract CI check, but **has not been tested against the actual Mac**
  and doesn't substitute for a real rollback rehearsal.
- Mac Node runtime remains unresolved and is not needed for this path.
- Platform runtime key *identity*, plugin workspace and actual ChatGPT
  3-tool discovery remain externally verifiable prerequisites.
- Neither automation schedules nor Activepieces/Watchdog/services/AI models,
  credentials, sales outreach, trading systems or production deployment
  have been changed.
- Live cutover is **NOT DONE** without an actual owner-Mac \`--apply\` receipt
  and independent remote fresh \`atlas_status\` evidence.
