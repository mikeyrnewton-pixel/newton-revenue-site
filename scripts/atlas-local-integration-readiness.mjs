#!/usr/bin/env node
/**
 * Read-only local Mac integration inventory; never starts/stops a service,
 * reads credentials, uses the public internet, or checks paid model endpoints.
 * Only fixed localhost sockets, the documented Activepieces local health endpoint,
 * and local status tools are queried.
 */
import { lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { spawnSync } from 'node:child_process';
import { checkActivepiecesLocalHealth } from '../lib/atlas-loopback-health.mjs';

const flags = new Set(process.argv.slice(2));
if (flags.has('--help')) {
  console.log('Usage: node scripts/atlas-local-integration-readiness.mjs [--json] [--no-probes]');
  console.log('Read-only: local tools, loopback-only checks, no API/provider calls.');
  process.exit(0);
}
if ([...flags].some(flag => !['--json', '--no-probes'].includes(flag))) {
  console.error('BLOCKED: unknown argument; no checks performed');
  process.exit(2);
}
const probe = !flags.has('--no-probes') && process.platform === 'darwin';
const skipped = flags.has('--no-probes') ? 'NOT_CHECKED_REQUESTED' : 'NOT_CHECKED_NON_MAC';
const home = homedir();

function isRealDirectory(path) {
  try { const s = lstatSync(path); return s.isDirectory() && !s.isSymbolicLink(); }
  catch { return false; }
}
function isRealFile(path) {
  try { const s = lstatSync(path); return s.isFile() && !s.isSymbolicLink(); }
  catch { return false; }
}
function localCommand(command, args) {
  // No shell, credentials, environment variables, CLI output or paths exposed.
  const child = spawnSync(command, args, {
    encoding: 'utf8', timeout: 1800, maxBuffer: 128 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  if (child.error || child.status !== 0) return null;
  return child.stdout;
}
async function portOpen(port) {
  return await new Promise(resolve => {
    let done = false;
    const socket = connect({host: '127.0.0.1', port});
    const finish = yes => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(yes);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
function tailscaleState() {
  const output = localCommand('tailscale', ['status', '--json']);
  if (!output) return 'CLI_OR_LOCAL_AGENT_UNAVAILABLE';
  try {
    const state = JSON.parse(output);
    if (state.BackendState === 'Running' && state.Self?.Online === true)
      return 'LOCAL_AGENT_ONLINE_REMOTE_REACHABILITY_UNVERIFIED';
    if (state.BackendState === 'Running') return 'LOCAL_AGENT_RUNNING_REMOTE_REACHABILITY_UNVERIFIED';
    return 'LOCAL_AGENT_NOT_RUNNING';
  } catch { return 'STATUS_UNREADABLE'; }
}
function activepiecesContainerState() {
  const output = localCommand('docker', ['ps', '--format', '{{.Names}}']);
  if (output === null) return 'DOCKER_QUERY_UNAVAILABLE';
  return output.split(/\r?\n/).some(n => /activepieces/i.test(n))
    ? 'MATCHING_CONTAINER_RUNNING_APP_HEALTH_UNVERIFIED'
    : 'NO_MATCHING_RUNNING_CONTAINER';
}

const report = {
  result: 'LOCAL_INTEGRATION_READ_ONLY_COMPLETE',
  authorisation: 'NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES',
  checkedOnMac: process.platform === 'darwin' && probe,
  privateMacCheckout: isRealDirectory(join(home, 'Newton-Empire'))
    ? 'DIRECTORY_PRESENT_CODE_UNVERIFIED' : 'NOT_DETECTED',
  buildStageReceipt: isRealFile(join(home, 'ATLAS-BUILD-READY', 'results', 'ATLAS_BUILD_STATUS.txt'))
    ? 'FILE_PRESENT_CONTENT_NOT_VERIFIED' : 'NOT_DETECTED',
  salesDeskStage: isRealDirectory(join(home, 'ATLAS-SALES-DESK-v1.2'))
    ? 'DIRECTORY_PRESENT_SERVICE_UNVERIFIED' : 'NOT_DETECTED',
  tailscale: probe ? tailscaleState() : skipped,
  activepiecesDocker: probe ? activepiecesContainerState() : skipped,
  activepiecesLoopback: probe
    ? (await portOpen(8080) ? 'PORT_OPEN_APP_ID_UNVERIFIED' : 'PORT_NOT_LISTENING') : skipped,
  activepiecesHealth: probe ? await checkActivepiecesLocalHealth() : skipped,
  salesDeskLoopback: probe
    ? (await portOpen(3777) ? 'PORT_OPEN_APP_ID_UNVERIFIED' : 'PORT_NOT_LISTENING') : skipped,
  assertion: 'No local detection alone proves end-to-end model routing, bot execution, customer delivery, or internet/iPhone reachability.',
};
if (flags.has('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('ATLAS LOCAL INTEGRATION — READ-ONLY / £0');
  for (const [name, value] of Object.entries(report))
    if (name !== 'assertion') console.log(name + '=' + value);
  console.log(report.assertion);
}
