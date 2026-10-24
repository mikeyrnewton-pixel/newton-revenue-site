#!/usr/bin/env node
/**
 * ATLAS Observer — launchd plan emitter ONLY (review branch; NEVER installs).
 *
 * Emits a fixed-scope 60-second per-user LaunchAgent plist for the local
 * snapshot publisher. No local launchctl calls, files, network calls, secrets,
 * service start/restart, or modification to the existing watchdog.
 * Installation/enabling requires a later, explicit owner approval.
 */
import path from "node:path";
import {fileURLToPath} from "node:url";

export const OBSERVER_LAUNCHD_LABEL = "uk.newton.atlas-observer-snapshot";
export const OBSERVER_REFRESH_SECONDS = 60;
export const OBSERVER_LAUNCHD_FILENAME = `${OBSERVER_LAUNCHD_LABEL}.plist`;

function safeAbsolute(p, basename) {
  if (typeof p !== "string" || !path.isAbsolute(p) || p.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(p) || path.basename(p) !== basename)
    throw Error("Invalid absolute executable path");
  return p;
}
function xmlEscape(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\x27/g,"&apos;");
}
/**
 * Host commands are NOT executed. No caller-supplied label, interval, script,
 * arguments, output targets or environment variables may alter the job.
 */
export function createObserverLaunchdPlist({nodePath=process.execPath,
  publisherPath=fileURLToPath(new URL("./atlas-observer-publisher.mjs",import.meta.url))}={}) {
  const binary = xmlEscape(safeAbsolute(nodePath,"node"));
  const publisher = xmlEscape(safeAbsolute(publisherPath,"atlas-observer-publisher.mjs"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${OBSERVER_LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binary}</string>
    <string>${publisher}</string>
    <string>--publish</string>
  </array>
  <key>StartInterval</key><integer>${OBSERVER_REFRESH_SECONDS}</integer>
  <key>RunAtLoad</key><false/>
  <key>KeepAlive</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict>
</plist>
`;
}
const invoked = process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (invoked) {
  const args=process.argv.slice(2);
  if (args.length===1 && args[0]==="--emit") {
    try {process.stdout.write(createObserverLaunchdPlist());}
    catch {process.stderr.write("HOLD: unable to generate safe plan.\n");process.exitCode=2;}
  } else if(args.length===1 && args[0]==="--help") {
    process.stdout.write("ATLAS Observer LaunchAgent preview: --emit prints XML; never writes/installs/enables.\n");
  } else {
    process.stderr.write("HOLD: --emit or --help only; no installation actions.\n");
    process.exitCode=2;
  }
}
