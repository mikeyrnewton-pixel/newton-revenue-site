#!/bin/bash
# Owner-operated, guarded hotfix of the EXISTING isolated read-only Observer.
# Does not touch tunnel clients, credential, Activepieces, trading or public ports.
# Only intended change: accept ignored standard MCP tools/call _meta metadata.
set -euo pipefail
umask 077
say(){ printf 'ATLAS_META_PATCH=%s\n' "$1"; }
hold(){ say "HOLD_$1";exit 2; }
[ "$#" -eq 1 ] && [ "$1" = --apply-verified-hotfix ] || hold EXACT_MODE_REQUIRED
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -ne 0 ] || hold OWNER_MAC_ONLY
D=/Applications/Docker.app/Contents/Resources/bin/docker
[ -x "$D" ] && "$D" info >/dev/null 2>&1 || hold DOCKER_UNAVAILABLE
OBS=atlas-mcp-observer-review
CANARY=atlas-mcp-readonly-canary
TUNNEL=atlas-tunnel-client-observer-candidate
OLD=atlas-tunnel-client-canary
SCRIPTS="$HOME/ATLAS-OBSERVER-MCP-REVIEW-20261024/scripts"
SNAP="$HOME/.atlas-observer"
TARGET="$SCRIPTS/atlas-mcp-observer.mjs"
LOCKDIR="$HOME/.atlas-observer-headless-rollback"
GUARD="$LOCKDIR/ids"
WORK="$HOME/.atlas-observer-meta-hotfix-20261102"
BACKUP="$WORK/original.mjs"
STAGED="$WORK/verified-patch.mjs"
ORIGINAL_SHA=56eafea5e1e2a60ec5de0a3eb8051ea6b72349c5
PATCH_SHA=c2a6d169b101d6dfe103bc1f14639b7d8c221d5a
PIN=d82dff0e0e482fa38c53cb82d6e8ae85e8ac6180
URL="https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/$PIN/scripts/atlas-mcp-observer-meta-hotfix-20261102.mjs"
fmt(){ "$D" inspect --format "$1" "$2" 2>/dev/null || hold INSPECT_FAILED; }
sha(){ /usr/bin/git hash-object "$1" 2>/dev/null || true; }
[ -f "$TARGET" ] && [ ! -L "$TARGET" ] || hold ORIGINAL_SOURCE_MISSING
case "$(sha "$TARGET")" in
  "$ORIGINAL_SHA") ;;
  "$PATCH_SHA") say ALREADY_PATCHED_NEEDS_INDEPENDENT_REMOTE_CHECK;exit 0;;
  *) hold ORIGINAL_SOURCE_HASH_CHANGED ;;
esac
for dir in "$SCRIPTS" "$SNAP" "$LOCKDIR";do
 [ -d "$dir" ] && [ ! -L "$dir" ] &&
 [ "$(stat -f %u "$dir")" = "$(id -u)" ] &&
 [ "$(stat -f %Lp "$dir")" = 700 ] || hold UNSAFE_PRIVATE_DIRECTORY
done
[ -f "$GUARD" ] && [ ! -L "$GUARD" ] &&
[ "$(stat -f %u "$GUARD")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$GUARD")" = 600 ] || hold ROLLBACK_GUARD_MISSING
for item in "$CANARY" "$TUNNEL" "$OBS";do
 [ "$(fmt '{{.State.Running}}' "$item")" = true ] || hold REQUIRED_CONTAINER_NOT_RUNNING
done
[ "$(fmt '{{.State.Running}}' "$OLD")" = false ] || hold ORIGINAL_TUNNEL_STATE
[ "$(fmt '{{range .Config.Env}}{{if eq . "MCP_SERVER_URL=http://127.0.0.1:18788/mcp"}}yes{{end}}{{end}}' "$TUNNEL")" = yes ] ||
 hold TUNNEL_NOT_POINTING_TO_OBSERVER
[ "$(fmt '{{.HostConfig.AutoRemove}}' "$OBS")" = true ] || hold OBSERVER_LIFECYCLE_CHANGED
[ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$OBS")" = true ] &&
[ "$(fmt '{{.HostConfig.Privileged}}' "$OBS")" = false ] &&
[ "$(fmt '{{.HostConfig.RestartPolicy.Name}}' "$OBS")" = no ] &&
[ "$(fmt '{{range .HostConfig.CapDrop}}{{if eq . "ALL"}}yes{{end}}{{end}}' "$OBS")" = yes ] &&
[ "$(fmt '{{range .HostConfig.SecurityOpt}}{{if or (eq . "no-new-privileges") (eq . "no-new-privileges:true")}}yes{{end}}{{end}}' "$OBS")" = yes ] ||
 hold OBSERVER_CONFINEMENT_CHANGED
[ "$(fmt '{{len .Mounts}}' "$OBS")" = 2 ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/opt/atlas-observer/scripts"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$OBS")" = yes ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/atlas-observer"}}{{if not .RW}}yes{{end}}{{end}}{{end}}' "$OBS")" = yes ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/opt/atlas-observer/scripts"}}{{.Source}}{{end}}{{end}}' "$OBS")" = "$SCRIPTS" ] &&
[ "$(fmt '{{range .Mounts}}{{if eq .Destination "/run/atlas-observer"}}{{.Source}}{{end}}{{end}}' "$OBS")" = "$SNAP" ] ||
 hold OBSERVER_MOUNTS_CHANGED
# Docker represents zero host port bindings as either null or {}.
# Reject ALL nonempty mappings; no host ports may be exposed.
ports="$(fmt '{{json .HostConfig.PortBindings}}' "$OBS")"
case "$ports" in null|'{}') ;; *) hold OBSERVER_HOST_PORTS_EXPOSED;; esac

[ "$(fmt '{{index .Config.Labels "com.newton.atlas.observer-review"}}' "$OBS")" = v1 ] &&
[ "$(fmt '{{json .Config.Entrypoint}}' "$OBS")" = '["node"]' ] &&
[ "$(fmt '{{json .Config.Cmd}}' "$OBS")" = '["--max-old-space-size=64","/opt/atlas-observer/scripts/atlas-mcp-observer.mjs","--serve"]' ] &&
[ "$(fmt '{{.Config.User}}' "$OBS")" = "$(id -u):$(id -g)" ] ||
 hold OBSERVER_LAUNCH_CHANGED
CID="$(fmt '{{.Id}}' "$CANARY")"
OBSID="$(fmt '{{.Id}}' "$OBS")"
IMAGE="$(fmt '{{.Image}}' "$OBS")"
[[ "$CID" =~ ^[a-f0-9]{64}$ && "$OBSID" =~ ^[a-f0-9]{64}$ &&
 "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || hold ID_FORMAT
[ "$(fmt '{{.Image}}' "$CANARY")" = "$IMAGE" ] || hold OBSERVER_IMAGE_CHANGED
net="$(fmt '{{.HostConfig.NetworkMode}}' "$OBS")"
case "$net" in "container:$CANARY"|"container:$CID") ;; *) hold OBSERVER_NETWORK_CHANGED;; esac
# Exact ID-guarded cutover must still be reversible. Read IDs only into memory.
guard_canary="$(sed -n '1p' "$GUARD")"
guard_old="$(sed -n '2p' "$GUARD")"
guard_new="$(sed -n '3p' "$GUARD")"
guard_extra="$(sed -n '4p' "$GUARD")"
[ -z "$guard_extra" ] &&
[ "$guard_canary" = "$CID" ] &&
[ "$guard_old" = "$(fmt '{{.Id}}' "$OLD")" ] &&
[ "$guard_new" = "$(fmt '{{.Id}}' "$TUNNEL")" ] || hold ROLLBACK_ID_MISMATCH
[ ! -L "$WORK" ] || hold STAGING_SYMLINK
if [ ! -d "$WORK" ];then mkdir -m 700 "$WORK" || hold STAGING_DIR_CREATE;fi
[ "$(stat -f %u "$WORK")" = "$(id -u)" ] &&
[ "$(stat -f %Lp "$WORK")" = 700 ] || hold STAGING_PERMISSIONS
mkdir "$WORK/lock" 2>/dev/null || hold PATCH_ALREADY_RUNNING
finished=0
replaced=0
stopped=0
cleanup(){
 local code=$?
 trap - EXIT
 set +e
 if [ "$finished" -ne 1 ] && [ "$replaced" -eq 1 ];then
   say RECOVERY_STARTED
   if "$D" inspect "$OBS" >/dev/null 2>&1;then
      "$D" container stop --time 10 "$OBS" >/dev/null 2>&1
   fi
   t="$(mktemp "$SCRIPTS/.atlas-restore.XXXXXXXX")"
   if [ -f "$BACKUP" ] && [ "$(sha "$BACKUP")" = "$ORIGINAL_SHA" ];then
      cp "$BACKUP" "$t" && chmod 600 "$t" && mv -f "$t" "$TARGET"
   fi
   if ! "$D" inspect "$OBS" >/dev/null 2>&1;then
      start_observer || say HOLD_ORIGINAL_OBSERVER_RESTART_FAILED
   fi
   say ORIGINAL_SOURCE_RESTORED_ATTEMPTED
 fi
 rmdir "$WORK/lock" >/dev/null 2>&1 || true
 exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
if [ -e "$BACKUP" ] || [ -L "$BACKUP" ];then
 [ -f "$BACKUP" ] && [ ! -L "$BACKUP" ] &&
 [ "$(sha "$BACKUP")" = "$ORIGINAL_SHA" ] || hold BACKUP_UNVERIFIED
else
 cp "$TARGET" "$BACKUP" && chmod 600 "$BACKUP" || hold BACKUP_FAILED
 [ "$(sha "$BACKUP")" = "$ORIGINAL_SHA" ] || hold BACKUP_HASH
fi
tmp="$(mktemp "$WORK/.download.XXXXXXXX")" || hold DOWNLOAD_TEMP
if ! /usr/bin/curl -fsSL --max-time 30 "$URL" -o "$tmp" >/dev/null 2>&1;then
 rm -f "$tmp";hold DOWNLOAD_FAILED
fi
[ "$(sha "$tmp")" = "$PATCH_SHA" ] || { rm -f "$tmp";hold PATCH_HASH_MISMATCH; }
chmod 600 "$tmp"
mv -f "$tmp" "$STAGED" || hold STAGE_MOVE_FAILED
[ "$(sha "$STAGED")" = "$PATCH_SHA" ] || hold STAGED_HASH
if ! "$D" exec -i "$OBS" node --check --input-type=module < "$STAGED" >/dev/null 2>&1;then
 hold PATCH_SYNTAX_INVALID
fi
start_observer(){
 "$D" run -d --rm --pull=never --name "$OBS" \
  --label com.newton.atlas.observer-review=v1 \
  --network "container:$CANARY" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 64 --memory 128m --cpus 0.5 \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$SCRIPTS,dst=/opt/atlas-observer/scripts,readonly" \
  --mount "type=bind,src=$SNAP,dst=/run/atlas-observer,readonly" \
  --entrypoint node "$IMAGE" --max-old-space-size=64 \
  /opt/atlas-observer/scripts/atlas-mcp-observer.mjs --serve >/dev/null 2>&1
}
say PRECHECKS_AND_STAGED_SOURCE_VERIFIED
# Atomically replace only the allowlisted source file; process stays isolated.
tmp2="$(mktemp "$SCRIPTS/.atlas-install.XXXXXXXX")" || hold INSTALL_TEMP
cp "$STAGED" "$tmp2" && chmod 600 "$tmp2" || hold INSTALL_COPY
[ "$(sha "$tmp2")" = "$PATCH_SHA" ] || hold INSTALL_HASH
mv -f "$tmp2" "$TARGET" || hold INSTALL_MOVE
replaced=1
[ "$(sha "$TARGET")" = "$PATCH_SHA" ] || hold INSTALLED_HASH_MISMATCH
[ "$(fmt '{{.Id}}' "$OBS")" = "$OBSID" ] || hold OBSERVER_ID_CHANGED
"$D" container stop --time 10 "$OBSID" >/dev/null 2>&1 || hold OBSERVER_STOP_FAILED
stopped=1
for i in 1 2 3;do
 "$D" inspect "$OBS" >/dev/null 2>&1 || break
 sleep 1
done
if "$D" inspect "$OBS" >/dev/null 2>&1;then hold OLD_OBSERVER_NOT_REMOVED;fi
start_observer || hold PATCHED_OBSERVER_START_FAILED
[ "$(fmt '{{.State.Running}}' "$OBS")" = true ] &&
[ "$(fmt '{{.HostConfig.ReadonlyRootfs}}' "$OBS")" = true ] &&
[ "$(fmt '{{.HostConfig.Privileged}}' "$OBS")" = false ] ||
 hold PATCHED_OBSERVER_STATE
# Internal-only acceptance: all three tools with MCP _meta plus fresh status.
if ! "$D" exec -i "$OBS" node --input-type=module <<'NODE'
const url="http://127.0.0.1:18788/mcp";
async function ask(name){
 const r=await fetch(url,{method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",
   params:{name,arguments:{},_meta:{progressToken:"atlas-patch-smoke"}}}),
  signal:AbortSignal.timeout(4000)});
 if(r.status!==200)throw Error("http");
 const j=await r.json();
 if(j.error||!j.result?.content?.[0]?.text)throw Error("tool");
 return j.result.content[0].text;
}
try {
 await ask("atlas_ping");
 const cap=JSON.parse(await ask("atlas_capabilities"));
 if(cap.writeActions!==false||cap.macShell!==false)throw Error("scope");
 const s=JSON.parse(await ask("atlas_status"));
 if(s.status!=="FRESH")throw Error("snapshot");
 console.log("ATLAS_META_PATCH=ALL_THREE_LOCAL_CALLS_ACCEPTED");
} catch{console.log("ATLAS_META_PATCH=HOLD_LOCAL_SMOKE");process.exitCode=2;}
NODE
then
 hold PATCHED_OBSERVER_SMOKE_FAILED
fi
[ "$(fmt '{{.State.Running}}' "$TUNNEL")" = true ] &&
[ "$(fmt '{{.State.Running}}' "$OLD")" = false ] &&
[ "$(sha "$TARGET")" = "$PATCH_SHA" ] || hold TUNNEL_OR_SOURCE_CHANGED
finished=1
say LOCAL_PATCH_VERIFIED_REMOTE_UNVERIFIED
say TUNNEL_UNCHANGED_ROLLBACK_PRESERVED
