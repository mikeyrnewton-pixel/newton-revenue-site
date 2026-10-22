import assert from "node:assert/strict";
import test from "node:test";

import {
  CANARY_CONTAINER_NAME,
  CANARY_MCP_URL,
  CONTAINER_KEY_PATH,
  HEALTH_LISTEN_ADDR,
  OFFICIAL_TUNNEL_IMAGE,
  TUNNEL_ID_ENV,
  buildTunnelDockerPlan,
  defaultTunnelDockerPlan,
} from "../scripts/atlas-tunnel-docker-plan.mjs";

const PRIVATE_KEY_PATH = "/private/atlas/openai_runtime_key";

function validInput(overrides = {}) {
  return {
    version: 1,
    image: OFFICIAL_TUNNEL_IMAGE,
    containerName: CANARY_CONTAINER_NAME,
    runtimeKeyFile: PRIVATE_KEY_PATH,
    mcpServerUrl: CANARY_MCP_URL,
    tunnelIdEnv: TUNNEL_ID_ENV,
    healthListenAddr: HEALTH_LISTEN_ADDR,
    ...overrides,
  };
}

test("builds a deterministic, non-executing owner-gated plan", () => {
  const first = buildTunnelDockerPlan(validInput());
  const second = buildTunnelDockerPlan(validInput());

  assert.deepEqual(first, second);
  assert.equal(first.state, "BLOCKED_OWNER");
  assert.equal(first.commandsExecuted, false);
  assert.equal(first.containerStarted, false);
  assert.equal(first.liveVerified, false);
  assert.equal(first.secretContentsRead, false);
  assert.equal(first.requiredApproval, "OWNER_START_TUNNEL_CANARY");
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.runArgv));
});

test("pins the official image and never pulls at start", () => {
  const { inspectArgv, runArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);

  assert.deepEqual(inspectArgv.slice(0, 4), [
    "docker",
    "image",
    "inspect",
    OFFICIAL_TUNNEL_IMAGE,
  ]);
  assert.ok(runArgv.includes(OFFICIAL_TUNNEL_IMAGE));
  assert.ok(runArgv.includes("--pull=never"));
  assert.ok(!runArgv.some((value) => value.includes(":latest")));
});

test("mounts the key read-only without placing key contents in argv", () => {
  const { runArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);
  const mountIndex = runArgv.indexOf("--mount");

  assert.notEqual(mountIndex, -1);
  assert.equal(
    runArgv[mountIndex + 1],
    `type=bind,src=${PRIVATE_KEY_PATH},dst=${CONTAINER_KEY_PATH},readonly`,
  );
  assert.ok(
    runArgv.includes(
      `--control-plane.api-key=file:${CONTAINER_KEY_PATH}`,
    ),
  );
  assert.ok(!runArgv.some((value) => /api[_-]?key=/iu.test(value) &&
    !value.startsWith("--control-plane.api-key=file:")));
});

test("passes only the tunnel ID environment variable name", () => {
  const { runArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);
  const envIndex = runArgv.indexOf("--env");

  assert.notEqual(envIndex, -1);
  assert.equal(runArgv[envIndex + 1], TUNNEL_ID_ENV);
  assert.equal(runArgv[envIndex + 2], OFFICIAL_TUNNEL_IMAGE);
  assert.ok(!runArgv.some((value) => value.startsWith(`${TUNNEL_ID_ENV}=`)));
});

test("hardens the container and exposes no host port", () => {
  const { runArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);

  for (const expected of [
    "--rm",
    "--restart=no",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
  ]) {
    assert.ok(runArgv.includes(expected), `missing ${expected}`);
  }
  assert.ok(!runArgv.includes("-p"));
  assert.ok(!runArgv.includes("--publish"));
  assert.ok(
    runArgv.includes(`--health.listen-addr=${HEALTH_LISTEN_ADDR}`),
  );
});

test("routes only to the fixed read-only canary", () => {
  const { runArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);

  assert.ok(runArgv.includes(`--mcp.server-url=${CANARY_MCP_URL}`));
  assert.ok(!runArgv.some((value) => /activepieces|prospect/iu.test(value)));
});

test("builds an explicit, bounded stop command", () => {
  const { stopArgv } = defaultTunnelDockerPlan(PRIVATE_KEY_PATH);

  assert.deepEqual(stopArgv, [
    "docker",
    "stop",
    "--time",
    "10",
    CANARY_CONTAINER_NAME,
  ]);
});

test("rejects unpinned or non-official images", () => {
  for (const image of [
    "ghcr.io/openai/tunnel-client:latest",
    "ghcr.io/openai/tunnel-client:v0.0.18",
    "example.invalid/tunnel-client:v0.0.17",
  ]) {
    assert.throws(
      () => buildTunnelDockerPlan(validInput({ image })),
      /pinned official/u,
    );
  }
});

test("rejects non-canary destinations and public health listeners", () => {
  assert.throws(
    () => buildTunnelDockerPlan(validInput({
      mcpServerUrl: "http://host.docker.internal:8080/api/v1/mcp",
    })),
    /read-only canary/u,
  );
  assert.throws(
    () => buildTunnelDockerPlan(validInput({
      healthListenAddr: "0.0.0.0:18080",
    })),
    /loopback-only/u,
  );
});

test("rejects unsafe key paths", () => {
  for (const runtimeKeyFile of [
    "relative/key",
    "/",
    "/private/atlas/../runtime_key",
    "/private/atlas/runtime_key/",
    "/private/atlas/runtime_key\nleak",
  ]) {
    assert.throws(
      () => buildTunnelDockerPlan(validInput({ runtimeKeyFile })),
      /runtimeKeyFile/u,
    );
  }
});

test("rejects hidden configuration fields that could widen access", () => {
  assert.throws(
    () => buildTunnelDockerPlan({
      ...validInput(),
      publishPort: 8080,
    }),
    /expected exactly/u,
  );
});
