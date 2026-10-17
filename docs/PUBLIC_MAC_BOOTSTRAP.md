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
