import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const file=fileURLToPath(new URL("../scripts/atlas-observer-local-container-20261024.sh",import.meta.url));
const source=readFileSync(file,"utf8");

test("Stage 2 script passes native Bash syntax inspection",()=>{
  const p=spawnSync("bash",["-n",file],{encoding:"utf8",timeout:4000});
  assert.equal(p.status,0,p.stderr);
});

test("Stage 2 uses exact owner switch and never enables broad privileged runtime",()=>{
  assert.match(source,/--start-local-only/);
  assert.match(source,/set -euo pipefail/);
  assert.match(source,/--cap-drop=ALL/);
  assert.match(source,/--security-opt no-new-privileges:true/);
  assert.match(source,/--read-only/);
  assert.match(source,/--pids-limit 64 --memory 128m --cpus 0\.5/);
  assert.match(source,/--user "\$\(id -u\):\$\(id -g\)"/);
  for(const denied of [/--privileged\b/,/--publish(?:-all)?\b/,/--network=(?:host|bridge)/,
    /--restart=(?:always|on-failure|unless-stopped)/,/docker\.sock/,/--device=/,
    /--cap-add/,/--security-opt seccomp=unconfined/,/--mount.*(?:dst|target)=\/Users\//]){
    assert.equal(denied.test(source),false,String(denied));
  }
});

test("Stage 2 uses exactly two read-only private host mounts and no auto-pull",()=>{
  const mounts=source.match(/--mount "type=bind,[^"\n]+"/g)??[];
  assert.equal(mounts.length,4); // preflight and eventual review container
  assert.deepEqual([...new Set(mounts)],[
    '--mount "type=bind,src=$SCRIPTS,dst=/opt/atlas-observer/scripts,readonly"',
    '--mount "type=bind,src=$SNAPDIR,dst=/run/atlas-observer,readonly"',
  ]);
  assert.equal((source.match(/--pull=never/g)??[]).length,3);
  assert.match(source,/if \[ ! -d "\$dir" \] \|\| \[ -L "\$dir" \]/);
  assert.match(source,/if "\$DOCKER" container inspect "\$OBSERVER" >/);
  assert.match(source,/CREATED_ID=\$\("\$DOCKER" run -d --rm --pull=never/);
  assert.match(source,/--network "container:\$CANARY"/);
  // Stage 2 must execute the exact image ID already running as the canary;
  // a locally retagged image must never silently become trusted.
  assert.match(source,/inspect -f '\{\{\.Image\}\}' "\$CANARY"/);
  assert.match(source,/sha256:\[0-9a-f\]\{64\}/);
  assert.doesNotMatch(source,/inspect -f '\{\{\.Config\.Image\}\}' "\$CANARY"/);
});

test("Stage 2 never changes the existing canary, tunnel or plugin",()=>{
  assert.match(source,/EXISTING_CANARY_AND_TUNNEL=RUNNING_ORIGINAL_IDS/);
  assert.match(source,/TUNNEL_ID=\$\("\$DOCKER" inspect -f '\{\{\.Id\}\}' "\$TUNNEL"\)/);
  assert.match(source,/baseline container identity or tunnel network changed/);
  assert.match(source,/CHATGPT_ATLAS_STATUS=NOT_CONNECTED/);
  assert.match(source,/MCP_TOOLS=EXACTLY_THREE_READ_ONLY/);
  assert.match(source,/UNAUTHORIZED_METHODS=DENIED/);
  assert.match(source,/--entrypoint node "\$IMAGE"/);
  assert.match(source,/trap cleanup_on_error EXIT/);
  assert.match(source,/"\$DOCKER" rm -f "\$CREATED_ID"/);
  assert.doesNotMatch(source,/"\$DOCKER" (?:stop|rm|restart|kill) "\$(?:CANARY|TUNNEL)"/);
  assert.doesNotMatch(source,/--env(?:=| )/);
  assert.doesNotMatch(source,/--mount.*runtime-key/);
});

test("Stage 2 rejects unknown and hidden host files inside either mounted directory",()=>{
  const from=source.indexOf("shopt -s nullglob dotglob");
  const until=source.indexOf("shopt -u nullglob dotglob",from);
  assert.ok(from>0 && until>from,"source must contain full fail-closed mount inventory");
  const snippet=source.slice(from,until+"shopt -u nullglob dotglob".length);
  const root=mkdtempSync(join(tmpdir(),"atlas-mount-inventory-"));
  const scripts=join(root,"scripts"), snapdir=join(root,"snap");
  mkdirSync(scripts);mkdirSync(snapdir);
  writeFileSync(join(scripts,"atlas-mcp-observer.mjs"),"reviewed");
  writeFileSync(join(scripts,"atlas-observer-snapshot.mjs"),"reviewed");
  writeFileSync(join(snapdir,"status.json"),'{"schema":"atlas.observer.snapshot.v1"}');
  const check=()=>spawnSync("bash",["-c",
    "set -euo pipefail; SCRIPTS=$1; SNAPDIR=$2; SNAP=$SNAPDIR/status.json; "+snippet,
    "atlas-inventory-check",scripts,snapdir],{encoding:"utf8",timeout:4000});
  try {
    assert.equal(check().status,0,"exact code files and snapshot allowed");
    writeFileSync(join(scripts,".hidden-credential"),"NO");
    let result=check();
    assert.equal(result.status,2,"hidden unexpected code mount file must fail");
    assert.match(result.stdout,/unexpected item in mounted source directory/);
    rmSync(join(scripts,".hidden-credential"));
    writeFileSync(join(snapdir,"unrelated-private.txt"),"NO");
    result=check();
    assert.equal(result.status,2,"unexpected snapshot directory file must fail");
    assert.match(result.stdout,/unexpected item in private snapshot mount directory/);
    rmSync(join(snapdir,"unrelated-private.txt"));
    writeFileSync(join(snapdir,".status-publisher.tmp"),"NO");
    result=check();
    assert.equal(result.status,2,"publisher temp collision must hold until cleared");
    rmSync(join(snapdir,".status-publisher.tmp"));
    assert.equal(check().status,0,"cleared temporary file passes");
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("post-start safety gates identify exact mismatch without broadening canary namespace",()=>{
  const from=source.indexOf("observer_running=$(");
  const stop="echo 'OBSERVER_RUNTIME_ISOLATION=VERIFIED'";
  const until=source.indexOf(stop,from);
  assert.ok(from>0 && until>from,"four named isolation gates required");
  const fragment=source.slice(from,until+stop.length);
  const root=mkdtempSync(join(tmpdir(),"atlas-isolation-fixture-"));
  const script=join(root,"mock-docker");
  writeFileSync(script,[
    "#!/bin/bash",
    "[ \"$1\" = inspect ] && [ \"$2\" = -f ] || exit 4",
    "case \"$3\" in",
    "  '{{.State.Running}}') echo \"$MOCK_RUNNING\" ;;",
    "  '{{.HostConfig.ReadonlyRootfs}}') echo \"$MOCK_ROOT\" ;;",
    "  '{{.HostConfig.Privileged}}') echo \"$MOCK_PRIV\" ;;",
    "  '{{.HostConfig.NetworkMode}}') echo \"$MOCK_NET\" ;;",
    "  *) exit 4 ;;",
    "esac",
  ].join("\n"),{mode:0o700});
  const mock=(overrides={})=>spawnSync("bash",["-c",
    "set -euo pipefail; DOCKER=$1; CREATED_ID=review_id; CANARY=canary; CANARY_ID=exact_canary_id; "+fragment,
    "isolation-check",script],{
    encoding:"utf8",timeout:4000,
    env:{...process.env,MOCK_RUNNING:"true",MOCK_ROOT:"true",
      MOCK_PRIV:"false",MOCK_NET:"container:canary",...overrides},
  });
  try {
    assert.equal(mock().status,0,"expected canary name accepted");
    assert.equal(mock({MOCK_NET:"container:exact_canary_id"}).status,0,
      "exact current canary ID accepted");
    for(const [environment,marker] of [
      [{MOCK_RUNNING:"false"},"OBSERVER_PROCESS_NOT_RUNNING_OR_REMOVED"],
      [{MOCK_ROOT:"false"},"OBSERVER_READONLY_ROOT_NOT_VERIFIED"],
      [{MOCK_PRIV:"true"},"OBSERVER_PRIVILEGED_STATE_UNSAFE"],
      [{MOCK_NET:"container:another_canary"},"OBSERVER_CANARY_NAMESPACE_MISMATCH"],
      [{MOCK_NET:"bridge"},"OBSERVER_CANARY_NAMESPACE_MISMATCH"],
      [{MOCK_NET:"container:exact_canary_id_suffix"},"OBSERVER_CANARY_NAMESPACE_MISMATCH"],
    ]){
      const result=mock(environment);
      assert.equal(result.status,2,JSON.stringify(environment));
      assert.match(result.stdout,new RegExp(marker));
      assert.doesNotMatch(result.stdout,/exact_canary_id|review_id/,
        "must not expose Docker identities in failure receipts");
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
