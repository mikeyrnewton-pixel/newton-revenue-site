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
