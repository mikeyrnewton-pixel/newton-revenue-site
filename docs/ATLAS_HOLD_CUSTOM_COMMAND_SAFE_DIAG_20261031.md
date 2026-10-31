# ATLAS — verified owner preflight HOLD_CUSTOM_COMMAND (31 October 2026)

Owner iPhone SSH screenshot (23:16 UK, 31 October):
- `ATLAS_BOOTSTRAP=BOTH_SOURCE_HASHES_VERIFIED`
- `ATLAS=HOLD_CUSTOM_COMMAND`
- `ATLAS_BOOTSTRAP=PREFLIGHT_HELD_NO_MAC_CUTOVER`
- `ATLAS_BOOTSTRAP_EXIT=2`

**Interpretation:** both pinned source blobs were authentic. The operator's
`localcheck` compared the existing tunnel's `Config.Cmd` to one exact
two-element expected command array and rejected a different one. Earlier
Stage 3 checks reached no HOLD; the observed difference is NOT evidence
of key compromise, a broken tunnel, or actual host deployment failure.
Importantly **no container was switched** and the original tunnel remains
the required rollback baseline.

## Immediately permitted, without owner awake

- Keep all five existing hourly automations enabled.
- Record this exact P0 diagnostic; no more generic Mac access claims.
- Carry on with P1 verified sales workforce / CASH / ACQUISITION, QA and
  review-only ORACLE while the owner is asleep.
- Review the existing command-shape logic using tests on draft PR47.

## For the owner next morning (do NOT run automatically)

An additional independent Bash script was written:
`scripts/atlas-tunnel-command-safe-diagnostic-20261031.sh`.

This script classifies known-safe fields and **only prints YES/NO flags and
array lengths**. It refuses Linux, root, unexpected mounts, writable root,
privileged tunnel and missing Docker. It never prints raw Docker
`Config.Cmd`, `Args`, `Config.Env`, secret bytes, tunnel ID or key path
and never stops/starts anything. Unknown arguments are marked as
`CMD_UNRECOGNISED` / `ENTRY_UNRECOGNISED`, never accepted.

For exact source review, the file was created at commit
`99bea5ac12201d4ad62041deae909f6220e5e07b` with Git blob SHA
`a5c3f0e1fe779297c453fb1e0e20631bc175ccb1`.

Paste the following into the existing owner iPhone "Run Script over SSH"
shortcut only when ready. It is an *inspection only* diagnostic:

```bash
set +e
tmp="$(mktemp /tmp/atlas-cmd-diagnostic.XXXXXXXX)"
url="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/99bea5ac12201d4ad62041deae909f6220e5e07b/scripts/atlas-tunnel-command-safe-diagnostic-20261031.sh"
if [ -z "$tmp" ] || ! /usr/bin/curl -fsSL --max-time 30 "$url" -o "$tmp"; then
  echo ATLAS_CMD_DIAG=HOLD_DOWNLOAD
else
  if [ "$(/usr/bin/git hash-object "$tmp" 2>/dev/null)" != "a5c3f0e1fe779297c453fb1e0e20631bc175ccb1" ];then
    echo ATLAS_CMD_DIAG=HOLD_HASH_MISMATCH
  else
    /bin/bash "$tmp" --inspect-only
    echo "ATLAS_CMD_DIAG_EXIT=$?"
  fi
  rm -f "$tmp"
fi
echo ATLAS_CMD_DIAG=FINISHED
exit 0
```

Send *only* the `ATLAS_CMD_DIAG=` lines. If any HOLD appears, STOP.
Never print or send the raw `docker inspect` structure or API keys.

After a safe read-only diagnosis, correct the operator's exact matching
only for an independently confirmed, expected launch configuration and
regression-test the result. No command rewriting or tunnel cutover while
owner is asleep. Later apply still depends on restricted runtime key and
correct ChatGPT workspace identity, rollback and fresh remote read-only
`atlas_status` evidence. Do not treat the fixed canary ping as live access.
