import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
  assert.match(source,/EXISTING_CANARY_AND_TUNNEL=UNMODIFIED/);
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
