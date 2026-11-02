#!/bin/bash
# ATLAS Stage 2 / owner-initiated local_proof_v1 demonstration.
# Explicit owner choice to run this exact mode is consent FOR THIS HARMLESS
# LOCAL PROOF ONLY. No authority for remote writes or commercial actions.
# Runs existing pinned source in one isolated Docker invocation so the
# 30-minute request expiry cannot be consumed by iPhone/chat delays.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_STAGE2_ONESHOT=%s\n' "$1"; }
hold(){ say "HOLD_$1"; exit 2; }
[ "$#" -eq 1 ] && [ "$1" = --owner-approve-local-proof ] || hold EXACT_OWNER_ACTION_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_REQUIRED
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] && "$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
S="$HOME/.atlas-stage2-proof-source"
P="$HOME/.atlas-stage2-proof-private"
F="$S/atlas-stage2-controlled-executor.mjs"
SRC_SHA=72bd99a0dbedc75d30e1d75ecca5c7a7df321a3e
privateDir(){
 [ -d "$1" ] && [ ! -L "$1" ] &&
 [ "$(stat -f %u "$1" 2>/dev/null)" = "$(id -u)" ] &&
 [ "$(stat -f %Lp "$1" 2>/dev/null)" = 700 ] || hold UNVERIFIED_PRIVATE_DIRECTORY
}
privateDir "$S"
privateDir "$P"
[ -f "$F" ] && [ ! -L "$F" ] &&
[ "$(stat -f %u "$F" 2>/dev/null)" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$F" 2>/dev/null)" = 600 ] &&
[ "$(stat -f %l "$F" 2>/dev/null)" = 1 ] &&
[ "$(/usr/bin/git hash-object "$F" 2>/dev/null)" = "$SRC_SHA" ] ||
 hold UNVERIFIED_EXECUTOR_SOURCE
case "$S:$P" in *','*|*$'\n'*|*$'\r'*) hold UNSAFE_BIND_PATH;; esac
OBS=atlas-mcp-observer-review
[ "$("$D" inspect --format '{{.State.Running}}' "$OBS" 2>/dev/null)" = true ] &&
[ "$("$D" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$OBS" 2>/dev/null)" = true ] ||
 hold OBSERVER_CHANGED
IMAGE="$("$D" inspect --format '{{.Image}}' "$OBS" 2>/dev/null)" || hold IMAGE_NOT_FOUND
[[ "$IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] || hold IMAGE_NOT_PINNED
say OWNER_INITIATED_LOCAL_PROOF_ONLY
# NODE receives only this static script over stdin. No user-supplied action
# names, paths, commands, HTTP access, Docker socket or extra permissions.
"$D" run -i --rm --pull=never --network none --read-only \
 --cap-drop ALL --security-opt no-new-privileges:true \
 --pids-limit 32 --memory 128m --cpus 0.25 \
 --user "$(id -u):$(id -g)" --env HOME=/run/atlas-stage2 \
 --mount "type=bind,src=$S,dst=/opt/atlas-stage2,readonly" \
 --mount "type=bind,src=$P,dst=/run/atlas-stage2" \
 --entrypoint node "$IMAGE" --input-type=module - <<'NODE'
import {makeController} from "file:///opt/atlas-stage2/atlas-stage2-controlled-executor.mjs";
const hold = code => {throw Error(code)};
try {
  const c=makeController();
  const actions=c.listActions();
  if(actions.length!==1 || actions[0].id!=="local_proof_v1" ||
     actions[0].network!==false || actions[0].shell!==false ||
     actions[0].docker!==false || actions[0].spending!==false ||
     actions[0].externalMessages!==false)hold("ACTION_ALLOWLIST");
  const p=c.propose("local_proof_v1");
  if(p.status!=="PROPOSED_NOT_APPROVED" ||
     !/^[a-f0-9]{24}$/.test(p.id))hold("PROPOSAL");
  console.log("ATLAS_STAGE2=NEW_REQUEST_CREATED");
  const a=c.approve(p.id,"I_APPROVE_STAGE2_LOCAL_PROOF");
  if(a.status!=="OWNER_APPROVAL_RECORDED" || a.id!==p.id)hold("APPROVAL");
  console.log("ATLAS_STAGE2=OWNER_APPROVAL_RECORDED");
  const x=c.execute(p.id);
  if(x.status!=="LOCAL_PROOF_EXECUTED" || x.id!==p.id ||
     x.externalEffect!==false || x.noSpend!==true)hold("EXECUTION");
  console.log("ATLAS_STAGE2=LOCAL_PROOF_EXECUTED");
  const receipt=c.receipt(p.id);
  if(receipt.id!==p.id || receipt.action!=="local_proof_v1" ||
     receipt.result!=="LOCAL_PROOF_ONLY" ||
     receipt.externalEffect!==false || receipt.noSpend!==true ||
     receipt.network!==false)hold("RECEIPT");
  console.log("ATLAS_STAGE2=PROOF_VERIFIED");
  console.log("ATLAS_STAGE2_REQUEST_ID="+p.id);
}catch(e){
  console.log("ATLAS_STAGE2=HOLD_"+(
    /^STAGE2_HOLD_[A-Z_]+$/.test(e.message) ? e.message.slice(12) :
    /^[A-Z_]+$/.test(e.message) ? e.message : "INTERNAL_ERROR"
  ));
  process.exitCode=2;
}
NODE
rc=$?
if [ "$rc" -ne 0 ];then say "HOLD_ISOLATED_PROOF_EXIT_$rc";exit 2;fi
[ "$("$D" inspect --format '{{.State.Running}}' "$OBS" 2>/dev/null)" = true ] ||
 hold OBSERVER_STATE_CHANGED
say PROOF_VERIFIED_NO_SERVICE_CHANGES
