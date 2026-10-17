# Corrected Mac build bootstrap: public entrypoint, private worker code

**Why the original iPhone shortcut showed 404:** `mikeyrnewton-pixel/Newton-Empire` is a **private** GitHub repository. The original shortcut tried fetching its `raw.githubusercontent.com` file without GitHub authentication; the repository/file does exist, but anonymous requests receive 404. Never make the repository public to bypass this.

The corrected **public** entrypoint `scripts/bootstrap_mac_builds.sh` is in the existing public site repository. It can be downloaded anonymously from its reviewed immutable commit with a SHA-256 checksum. Once invoked by the user's **existing** iPhone Shortcuts SSH connection, it stages public site tests and fictional diagnostic/quote output in `~/ATLAS-BUILD-READY` on the Mac. It tries to access the **private** Newton-Empire workers using only credentials already configured on the Mac (`gh auth status` or non-interactive git). If not authorised, it reports `PRIVATE_BUILDS=AUTH_REQUIRED`; it neither asks for a token in chat nor treats the private failure as success.

This is a staging/build acceptance step. No new launchd job, Activepieces automation, Grok Bot connection, business post, broker order or customer contact is created. Staged source and tests are **not** permanent unattended operation or live deployment. The next distinct step is to connect the **actual existing Mac launchd/Activepieces/BEAST** routines to the safe builder tasks, based on the private status result and the user's explicit approval of any necessary account/security changes.

For the eventual always-on setup:
- Mac plugged into mains, connected to internet, kept awake while display may be off (MacBook lid must not put it to sleep).
- `launchd` existing local jobs, once correctly configured, can run even with the user's iPhone away/offline. The ChatGPT scheduled build tasks and GitHub Actions are cloud-side and separate.
- iOS Tailscale is a VPN. Switching to another iOS full-tunnel VPN disconnects the phone from its Tailscale SSH route; it does **not** stop Mac-side jobs that were already scheduled.
- Minimise commands/logs sent over a private client app; never paste macOS passwords, GitHub tokens or Cloudflare admin secrets into ChatGPT.

The post-bootstrap `ATLAS_BUILD_STATUS.txt` is the only output necessary to interpret next safe steps; status should remain `REAL_CUSTOMER_DELIVERY=HOLD` until human commercial/security gates are independently verified.

## Existing private Mac checkout recovery

A prior authenticated Mac installation placed the private Newton-Empire repository at `~/Newton-Empire`. If authenticated cloning into the stage folder still fails, the public bootstrap now checks **that existing local checkout** without displaying its origin or credentials. It does **not** pull, reset, copy private `.env`, or alter the installed source. It may execute the four already-reviewed **offline synthetic** build tasks in-place only if the local Git origin, clean main branch, and exact source Git-blob SHA (`7a484b9ab93ff49a6a463214cd4ff3518d452b5c`) match the approved private builder. Otherwise it returns a precise `LOCAL_PRIVATE_CHECKOUT_...` or `LOCAL_PRIVATE_BUILDER_...` blocker instead of silently running older code. The owner still has to approve any later GitHub authentication change, local code upgrade or always-on daemon modification.

The same stage run also writes a nonsecret read-only AI credential summary to `results/AI_PROVIDER_READINESS.json`. The separate xAI/Grok API, DeepSeek and Perplexity API routes remain inactive unless there is verified account approval and acceptable billing. Nothing here automatically enables additional providers or modifies Grok Bot.


## Local integration receipt (read-only upgrade, 17 October)

The existing Mac bootstrap now also saves **~/ATLAS-BUILD-READY/results/LOCAL_INTEGRATION_READINESS.json** (permissions 0600). It inventories the pre-existing Mac checkout, build receipt, staged Sales Desk, local Tailscale CLI status, Docker Activepieces container-name match, and loopback listeners (8080 and 3777). It never starts a service, touches passwords, queries a billable provider, publishes work, or connects the phone remotely.

The report deliberately labels directories as present but unverified, port listeners as app identity unverified, and Tailscale's local agent status as remote reachability unverified. Missing tools, closed ports, a sleeping Mac, or another service on the same port do **not** prove an installation is broken or working. Docker container names are only a clue, not a service health check. This upgrade does not silently edit existing launchd jobs, Activepieces flows, Tailscale settings, or the live Sales Desk.

The bootstrap receipt includes LOCAL_INTEGRATION_INVENTORY=COMPLETE_READ_ONLY_NOT_CONNECTED. That is an inventory completed state, not operational integration or customer-delivery acceptance. To mark individual components VERIFIED, perform explicitly scoped, safe, real handoff tests after the Mac-side inventory is available.

### Activepieces health endpoint verification

The existing Mac integration receipt now checks `GET http://127.0.0.1:8080/api/v1/health` without any tokens, external DNS, redirects, request body or paid-provider calls. This is the Activepieces-documented health endpoint, including for version 0.92.0. A 2xx response is recorded as `HEALTH_HTTP_2XX_APP_ID_AND_WORKERS_UNVERIFIED`, **not** proof that the running process is Activepieces, its workers are healthy, its flows are active or end-to-end integrations work. HTTP error/redirects and network errors fail closed. This check uses port 8080 only: a different pre-existing mapped port needs a separate grounded local read, not an automated reconfiguration. No Docker, Tailscale or app configuration changes are made.

## Reviewed iPhone SSH handoff — one controlled local action

Use the **existing Tailscale iPhone Shortcut → Run Script over SSH** targeting the already-authorised Mac. Paste this script as the remote command; do not paste passwords or API keys. The script verifies the public launcher bytes before executing. It first dry-runs and then stages only previously authorised offline work.

```sh
set -eu
atlas_tmp="$(mktemp "${TMPDIR:-/tmp}/atlas-bootstrap.XXXXXX")"
trap 'rm -f "$atlas_tmp"' EXIT
curl -fsSL --proto '=https' --tlsv1.2 -o "$atlas_tmp" 'https://raw.githubusercontent.com/mikeyrnewton-pixel/newton-revenue-site/d900efde1c5753a3f627bb780c9d89163a6efb43/scripts/bootstrap_mac_builds.sh'
printf '%s  %s\n' '133bb312b4a4f30b743aab72aaf42252ad544571ea927a1e8ded02d906fe12f1' "$atlas_tmp" | shasum -a 256 -c -
bash "$atlas_tmp" --dry-run
bash "$atlas_tmp" --apply
```

**Success** prints `MAC_STAGED=YES`, public tests, optional private builds result, nonsecret AI and integration inventory receipts, and `REAL_CUSTOMER_DELIVERY=HOLD`. If download/checksum/preflight fails, stop; do **not** run a fallback unverified installer. The script does not create/enable long-running services and never activates paid AI APIs. The site repository source is updated from its checked main branch by the bootstrap; the checksum above covers the launcher script itself, not every downstream file in that repository. Source/CI status was checked at writing; the owner should avoid this command if a subsequent unreviewed site source change appears. A status receipt is proof of the staging checks only, not full end-to-end AI/bot connectivity.

After running, the safe text receipt is `~/ATLAS-BUILD-READY/results/ATLAS_BUILD_STATUS.txt`. Do **not** share `.env`, any JSON with credentials, SSH details or Git remotes. If a health check shows Activepieces HTTP 2xx, this is still only local endpoint responsiveness; it does not prove workers or flows have executed.


### Recovery for a preserved control-bridge branch (17 October)

Mac-side evidence establishes the live private repo is clean but on build/control-bridge-2026-09-30 (HEAD 1e376b1eaa28e88b07136682f9e1a179b2de5a95), with a stale local main and no run_build_shift.sh in that local main. **Do not checkout/switch, merge, pull, reset, stash, clean or delete this branch.** Its control bridge has separate unmerged work.

The bootstrap's new narrowly pinned fallback checks the existing private origin silently, current branch and exact commit, and no tracked edits. It then tries a non-interactive, existing-credentials-only `git fetch --no-tags origin main`. Git fetch updates local Git objects/FETCH_HEAD but does **not** switch branches or change the checked-out working files. The fetched HEAD must equal the reviewed private commit 301f7d31c6f4b34bc71ad0967cbc85e73a5c2805. Its reviewed run_build_shift.sh must have Git blob fingerprint 7a484b9ab93ff49a6a463214cd4ff3518d452b5c. The installer extracts only that runner into a temporary permission-restricted local file, runs the same four offline fictional build tasks, then deletes the temporary copy. No private .env, token, remote URL, full source tree or live launchd job is copied or changed.

If Git authentication fails, it records PRIVATE_FETCH_NEEDS_EXISTING_GITHUB_AUTH without prompting for keys. If commits/fingerprints differ, the installer refuses execution. A four-task result is proof of staged synthetic builders, never proof of connected AI, running automation, customer service or revenue. This is a recovery for this single inspected branch/commit, not permission to overwrite future developer changes. After source merge and CI, use a **new immutable checksum-verified launcher**; the older script pinned in the previous section will not include this recovery. No change to Grok Bot, AI API billing or real services is authorised.
