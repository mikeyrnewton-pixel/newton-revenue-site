import path from "node:path";

export const OFFICIAL_TUNNEL_IMAGE =
  "ghcr.io/openai/tunnel-client:v0.0.17";
export const CANARY_CONTAINER_NAME = "atlas-tunnel-readonly-canary";
export const CANARY_MCP_URL = "http://host.docker.internal:18787/mcp";
export const CONTAINER_KEY_PATH = "/run/secrets/openai_runtime_key";
export const TUNNEL_ID_ENV = "CONTROL_PLANE_TUNNEL_ID";
export const HEALTH_LISTEN_ADDR = "127.0.0.1:18080";

const REQUIRED_KEYS = Object.freeze([
  "version",
  "image",
  "containerName",
  "runtimeKeyFile",
  "mcpServerUrl",
  "tunnelIdEnv",
  "healthListenAddr",
]);

function fail(message) {
  throw new TypeError(`Unsafe tunnel Docker plan: ${message}`);
}

function assertExactKeys(input) {
  const actual = Object.keys(input).sort();
  const expected = [...REQUIRED_KEYS].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`expected exactly: ${expected.join(", ")}`);
  }
}

function validateRuntimeKeyPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    fail("runtimeKeyFile must be an absolute path");
  }
  if (value.includes("\0") || /[\r\n]/u.test(value)) {
    fail("runtimeKeyFile contains control characters");
  }

  const segments = value.split("/");
  if (value === "/" || segments.includes("..") || path.normalize(value) !== value) {
    fail("runtimeKeyFile must be a normalized file path");
  }
  if (value.endsWith("/")) {
    fail("runtimeKeyFile must identify a file");
  }
}

function deepFreezePlan(plan) {
  for (const value of Object.values(plan)) {
    if (Array.isArray(value)) Object.freeze(value);
  }
  return Object.freeze(plan);
}

/**
 * Builds, but never executes, the single-purpose Docker command plan for the
 * read-only ATLAS MCP canary. Secret contents are never read or returned.
 */
export function buildTunnelDockerPlan(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input must be an object");
  }

  assertExactKeys(input);

  if (input.version !== 1) fail("version must be 1");
  if (input.image !== OFFICIAL_TUNNEL_IMAGE) {
    fail("image must be the pinned official v0.0.17 image");
  }
  if (input.containerName !== CANARY_CONTAINER_NAME) {
    fail("containerName is not allowlisted");
  }
  if (input.mcpServerUrl !== CANARY_MCP_URL) {
    fail("mcpServerUrl must target the local read-only canary");
  }
  if (input.tunnelIdEnv !== TUNNEL_ID_ENV) {
    fail("tunnelIdEnv is not allowlisted");
  }
  if (input.healthListenAddr !== HEALTH_LISTEN_ADDR) {
    fail("health listener must remain loopback-only");
  }
  validateRuntimeKeyPath(input.runtimeKeyFile);

  const secretMount =
    `type=bind,src=${input.runtimeKeyFile},dst=${CONTAINER_KEY_PATH},readonly`;

  return deepFreezePlan({
    schema: "atlas.tunnel-docker-plan.v1",
    state: "BLOCKED_OWNER",
    commandsExecuted: false,
    containerStarted: false,
    liveVerified: false,
    secretContentsRead: false,
    requiredApproval: "OWNER_START_TUNNEL_CANARY",
    inspectArgv: [
      "docker",
      "image",
      "inspect",
      input.image,
      "--format",
      "{{.Id}} {{.Architecture}}",
    ],
    runArgv: [
      "docker",
      "run",
      "--rm",
      "--name",
      input.containerName,
      "--pull=never",
      "--restart=no",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=16m",
      "--mount",
      secretMount,
      "--env",
      input.tunnelIdEnv,
      input.image,
      "run",
      `--control-plane.api-key=file:${CONTAINER_KEY_PATH}`,
      `--mcp.server-url=${input.mcpServerUrl}`,
      `--health.listen-addr=${input.healthListenAddr}`,
    ],
    stopArgv: [
      "docker",
      "stop",
      "--time",
      "10",
      input.containerName,
    ],
  });
}

export function defaultTunnelDockerPlan(runtimeKeyFile) {
  return buildTunnelDockerPlan({
    version: 1,
    image: OFFICIAL_TUNNEL_IMAGE,
    containerName: CANARY_CONTAINER_NAME,
    runtimeKeyFile,
    mcpServerUrl: CANARY_MCP_URL,
    tunnelIdEnv: TUNNEL_ID_ENV,
    healthListenAddr: HEALTH_LISTEN_ADDR,
  });
}
