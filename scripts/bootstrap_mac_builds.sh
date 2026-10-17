#!/bin/bash
set -Eeuo pipefail
# Public, credential-free ENTRYPOINT. Private Newton-Empire source stays private.
# Reuse only GitHub authentication already configured on user's own Mac.
MODE="${1:---dry-run}"
case "$MODE" in
  --dry-run|--apply) ;;
  --help) echo "Usage: bash bootstrap_mac_builds.sh [--dry-run|--apply]"; exit 0 ;;
  *) echo "BLOCKED: invalid option" >&2; exit 2 ;;
esac
[[ "$(uname -s)" == Darwin ]] || { echo "BLOCKED: Mac only" >&2; exit 3; }
export PATH="$HOME/ATLAS-LOCAL-SETUP/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
for tool in git node shasum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "BLOCKED: missing $tool" >&2; exit 3; }
done
NODE="$(command -v node)"
VERSION="$("$NODE" --version)"
case "$VERSION" in v2[02468].*|v3[02468].*) ;; *)
  echo "BLOCKED: Node 20+ required, found $VERSION" >&2; exit 3 ;;
esac
if [[ "$MODE" == "--dry-run" ]]; then
  echo "MAC_PREFLIGHT=OK NODE=$VERSION NO_CHANGES_MADE=YES"
  exit 0
fi
umask 077
BASE="$HOME/ATLAS-BUILD-READY"
for dir in "$BASE" "$BASE/source" "$BASE/results"; do
  [[ ! -L "$dir" ]] || { echo "BLOCKED: unexpected symlink folder" >&2; exit 3; }
  mkdir -p "$dir"; chmod 700 "$dir"
done
SITE="$BASE/source/newton-revenue-site"
EMPIRE="$BASE/source/Newton-Empire"
OUT="$BASE/results"
# Never overwrite existing locally changed code.
safe_repo() {
  local path="$1" name="$2" url branch
  [[ -d "$path/.git" ]] || { echo "BLOCKED: unexpected $name folder" >&2; return 3; }
  url="$(git -C "$path" remote get-url origin 2>/dev/null || true)"
  case "$url" in
    "https://github.com/mikeyrnewton-pixel/$name"|"https://github.com/mikeyrnewton-pixel/$name.git"|"git@github.com:mikeyrnewton-pixel/$name"|"git@github.com:mikeyrnewton-pixel/$name.git") ;;
    *) echo "BLOCKED: unexpected $name remote" >&2; return 3 ;;
  esac
  branch="$(git -C "$path" symbolic-ref -q --short HEAD || true)"
  [[ "$branch" == main ]] || { echo "BLOCKED: $name not on main" >&2; return 3; }
  [[ -z "$(git -C "$path" status --porcelain)" ]] ||
    { echo "BLOCKED: $name has local edits" >&2; return 3; }
}
if [[ ! -e "$SITE" ]]; then
  GIT_TERMINAL_PROMPT=0 git clone --quiet --branch main \
    "https://github.com/mikeyrnewton-pixel/newton-revenue-site.git" "$SITE"
fi
safe_repo "$SITE" newton-revenue-site
GIT_TERMINAL_PROMPT=0 git -C "$SITE" fetch --quiet origin main
git -C "$SITE" merge-base --is-ancestor HEAD FETCH_HEAD ||
  { echo "BLOCKED: public site checkout diverged" >&2; exit 3; }
git -C "$SITE" merge --ff-only FETCH_HEAD >/dev/null
"$NODE" --test "$SITE"/tests/*.test.mjs > "$OUT/site-tests.log" 2>&1 ||
  { echo "FAILED: site acceptance (see local site-tests.log)" >&2; tail -n 5 "$OUT/site-tests.log"; exit 1; }
"$NODE" "$SITE/scripts/build-diagnostic-demo.mjs" "$OUT/fictional-diagnostic.md"
"$NODE" "$SITE/scripts/build-mock-quote.mjs" "$OUT/fictional-quote.md"
grep -q 'Delivery release: HOLD' "$OUT/fictional-diagnostic.md"
grep -q 'COMMERCIAL RELEASE HOLD' "$OUT/fictional-quote.md"
# Zero-cost, read-only model inventory; never invokes providers or prints keys.
if [[ ! -f "$SITE/scripts/atlas-provider-readiness.mjs" ]]; then
  echo "BLOCKED: AI provider-readiness script absent from the approved public site checkout" >&2
  exit 3
fi
"$NODE" "$SITE/scripts/atlas-provider-readiness.mjs" --json > "$OUT/AI_PROVIDER_READINESS.json"
chmod 600 "$OUT/AI_PROVIDER_READINESS.json"
# Local-only status of EXISTING Tailscale, Activepieces, staged Sales Desk.
# The presence of any port/process/folder does NOT prove working integration.
[[ -f "$SITE/scripts/atlas-local-integration-readiness.mjs" ]] || {
  echo "BLOCKED: local integration readiness script absent" >&2
  exit 3
}
"$NODE" "$SITE/scripts/atlas-local-integration-readiness.mjs" --json > "$OUT/LOCAL_INTEGRATION_READINESS.json"
chmod 600 "$OUT/LOCAL_INTEGRATION_READINESS.json"
"$NODE" -e '
const fs=require("node:fs");
const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if(r.result!=="LOCAL_INTEGRATION_READ_ONLY_COMPLETE" ||
   r.authorisation!=="NO_EXTERNAL_NETWORK_NO_PAID_API_NO_CHANGES") process.exit(3);
' "$OUT/LOCAL_INTEGRATION_READINESS.json" || {
  echo "FAILED: local integration inventory; no services changed" >&2
  exit 3
}
PROVIDER_COUNTS="$("$NODE" -e '
const fs=require("node:fs");
const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if(x.result!=="READ_ONLY_INVENTORY_COMPLETE" ||
   x.authorisation!=="NO_PROVIDER_NETWORK_CALLS_NO_CHARGES") process.exit(3);
const found=x.providers.filter(p=>p.credentialStatus==="PRESENT_UNTESTED");
process.stdout.write("CREDENTIALS_PRESENT_UNTESTED="+found.length+" OPTIONAL_ROUTES_DISABLED="+x.optionalDirectRoutesInSource);
' "$OUT/AI_PROVIDER_READINESS.json")" || {
  echo "FAILED: local inventory integrity check; no AI provider enabled" >&2
  exit 3
}
PRIVATE_STATUS="AUTH_REQUIRED"
# Authenticated private repository access is attempted ONLY using credentials
# already on the Mac. No token is printed, requested, stored or exposed.
if [[ ! -e "$EMPIRE" ]]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh repo clone mikeyrnewton-pixel/Newton-Empire "$EMPIRE" -- --branch main --quiet >/dev/null 2>&1 || true
  fi
  if [[ ! -e "$EMPIRE" ]]; then
    GIT_TERMINAL_PROMPT=0 git clone --quiet --branch main \
      "https://github.com/mikeyrnewton-pixel/Newton-Empire.git" "$EMPIRE" >/dev/null 2>&1 || true
  fi
fi
if [[ -d "$EMPIRE/.git" ]]; then
  safe_repo "$EMPIRE" Newton-Empire
  if GIT_TERMINAL_PROMPT=0 git -C "$EMPIRE" fetch --quiet origin main 2>/dev/null; then
    git -C "$EMPIRE" merge-base --is-ancestor HEAD FETCH_HEAD ||
      { echo "BLOCKED: private repo diverged"; exit 3; }
    git -C "$EMPIRE" merge --ff-only FETCH_HEAD >/dev/null
    if [[ -f "$EMPIRE/scripts/run_build_shift.sh" ]]; then
      for task in TASK-009 TASK-010 TASK-012 TASK-013; do
        ATLAS_BUILD_ONLY=1 ATLAS_BUILD_TASK_ID="$task" ATLAS_SITE_REPO="$SITE" \
          ATLAS_BUILD_OUTPUT_DIR="$OUT" bash "$EMPIRE/scripts/run_build_shift.sh"
      done
      PRIVATE_STATUS="FOUR_OFFLINE_BUILD_TASKS_RUN"
    else
      PRIVATE_STATUS="BUILDER_NOT_PRESENT"
    fi
  fi
fi
# Fallback to the user's PRE-EXISTING local private checkout. Do not request
# a fresh GitHub login, reuse credentials, copy .env, or run unreviewed code.
# A local checkout is independently known to exist at ~/Newton-Empire.
if [[ "$PRIVATE_STATUS" == "AUTH_REQUIRED" ]]; then
  LOCAL_EMPIRE="$HOME/Newton-Empire"
  if [[ ! -L "$LOCAL_EMPIRE" && -d "$LOCAL_EMPIRE/.git" ]]; then
    LOCAL_ORIGIN="$(git -C "$LOCAL_EMPIRE" remote get-url origin 2>/dev/null || true)"
    case "$LOCAL_ORIGIN" in
      "https://github.com/mikeyrnewton-pixel/Newton-Empire"|"https://github.com/mikeyrnewton-pixel/Newton-Empire.git"|https://*@github.com/mikeyrnewton-pixel/Newton-Empire|https://*@github.com/mikeyrnewton-pixel/Newton-Empire.git|"git@github.com:mikeyrnewton-pixel/Newton-Empire"|"git@github.com:mikeyrnewton-pixel/Newton-Empire.git")
        if [[ "$(git -C "$LOCAL_EMPIRE" symbolic-ref -q --short HEAD || true)" != main ]] ||
           [[ -n "$(git -C "$LOCAL_EMPIRE" status --porcelain --untracked-files=no)" ]]; then
          PRIVATE_STATUS="LOCAL_PRIVATE_CHECKOUT_HAS_UNSAVED_EDITS_OR_NON_MAIN"
        elif [[ ! -f "$LOCAL_EMPIRE/scripts/run_build_shift.sh" ]]; then
          PRIVATE_STATUS="LOCAL_PRIVATE_CHECKOUT_FOUND_NEEDS_BUILD_CODE_UPDATE"
        elif [[ "$(git hash-object "$LOCAL_EMPIRE/scripts/run_build_shift.sh")" != "7a484b9ab93ff49a6a463214cd4ff3518d452b5c" ]]; then
          PRIVATE_STATUS="LOCAL_PRIVATE_BUILDER_DIFFERS_FROM_APPROVED_SOURCE"
        else
          # The exact local script content matches the already-reviewed private
          # GitHub blob. Run ONLY deterministic, fictional no-API build tasks.
          for task in TASK-009 TASK-010 TASK-012 TASK-013; do
            ATLAS_BUILD_ONLY=1 ATLAS_BUILD_TASK_ID="$task" ATLAS_SITE_REPO="$SITE" \
              ATLAS_BUILD_OUTPUT_DIR="$OUT" bash "$LOCAL_EMPIRE/scripts/run_build_shift.sh"
          done
          PRIVATE_STATUS="FOUR_APPROVED_LOCAL_OFFLINE_BUILD_TASKS_RUN"
        fi
        ;;
      *) PRIVATE_STATUS="LOCAL_PRIVATE_CHECKOUT_ORIGIN_NOT_APPROVED" ;;
    esac
  fi
fi


# Preserve the user's live CONTROL BRIDGE checkout and its development branch.
# An old local main cannot supply a builder, but the approved newer private
# main can be fetched as immutable Git objects WITHOUT changing HEAD or files.
# Only this specifically inspected control branch/head is supported; fail shut
# if its state, approved remote, or reviewed private main has changed.
if [[ "$PRIVATE_STATUS" == "LOCAL_PRIVATE_CHECKOUT_HAS_UNSAVED_EDITS_OR_NON_MAIN" ]]; then
  LOCAL_EMPIRE="$HOME/Newton-Empire"
  if [[ ! -L "$LOCAL_EMPIRE" && -d "$LOCAL_EMPIRE/.git" ]]; then
    LOCAL_ORIGIN="$(git -C "$LOCAL_EMPIRE" remote get-url origin 2>/dev/null || true)"
    case "$LOCAL_ORIGIN" in
      "https://github.com/mikeyrnewton-pixel/Newton-Empire"|"https://github.com/mikeyrnewton-pixel/Newton-Empire.git"|https://*@github.com/mikeyrnewton-pixel/Newton-Empire|https://*@github.com/mikeyrnewton-pixel/Newton-Empire.git|"git@github.com:mikeyrnewton-pixel/Newton-Empire"|"git@github.com:mikeyrnewton-pixel/Newton-Empire.git")
        if [[ "$(git -C "$LOCAL_EMPIRE" symbolic-ref -q --short HEAD || true)" != "build/control-bridge-2026-09-30" ]] ||
           [[ "$(git -C "$LOCAL_EMPIRE" rev-parse --verify HEAD 2>/dev/null || true)" != "1e376b1eaa28e88b07136682f9e1a179b2de5a95" ]] ||
           [[ -n "$(git -C "$LOCAL_EMPIRE" status --porcelain --untracked-files=no)" ]]; then
          PRIVATE_STATUS="CONTROL_BRIDGE_CHANGED_NO_PRIVATE_EXECUTION"
        elif ! GIT_TERMINAL_PROMPT=0 git -C "$LOCAL_EMPIRE" fetch --quiet --no-tags origin main >/dev/null 2>&1; then
          PRIVATE_STATUS="PRIVATE_FETCH_NEEDS_EXISTING_GITHUB_AUTH"
        elif [[ "$(git -C "$LOCAL_EMPIRE" rev-parse --verify FETCH_HEAD 2>/dev/null || true)" != "301f7d31c6f4b34bc71ad0967cbc85e73a5c2805" ]]; then
          PRIVATE_STATUS="PRIVATE_REMOTE_MAIN_CHANGED_REVIEW_REQUIRED"
        else
          # Fetch only updates Git objects/FETCH_HEAD, never the current branch,
          # working tree, private .env or any live launchd/Activepieces service.
          REVIEWED_BUILDER="$(mktemp "$OUT/.approved-private-builder.XXXXXXXX")"
          if git -C "$LOCAL_EMPIRE" show "301f7d31c6f4b34bc71ad0967cbc85e73a5c2805:scripts/run_build_shift.sh" > "$REVIEWED_BUILDER" 2>/dev/null &&
             [[ "$(git hash-object "$REVIEWED_BUILDER")" == "7a484b9ab93ff49a6a463214cd4ff3518d452b5c" ]]; then
            # Only synthetic, previously reviewed tasks, written inside the
            # existing locked-down build-stage results folder.
            trap 'rm -f "$REVIEWED_BUILDER"' EXIT
            for task in TASK-009 TASK-010 TASK-012 TASK-013; do
              ATLAS_BUILD_ONLY=1 ATLAS_BUILD_TASK_ID="$task" ATLAS_SITE_REPO="$SITE" \
                ATLAS_BUILD_OUTPUT_DIR="$OUT" bash "$REVIEWED_BUILDER"
            done
            PRIVATE_STATUS="FOUR_PINNED_PRIVATE_SYNTHETIC_BUILDS_RUN"
            rm -f "$REVIEWED_BUILDER"
            trap - EXIT
          else
            PRIVATE_STATUS="PRIVATE_BUILDER_FINGERPRINT_MISMATCH"
            rm -f "$REVIEWED_BUILDER"
          fi
        fi
        ;;
      *) PRIVATE_STATUS="LOCAL_PRIVATE_CHECKOUT_ORIGIN_NOT_APPROVED" ;;
    esac
  fi
fi

JOURNEY="NOT_IN_MERGED_MAIN"
if [[ -f "$SITE/scripts/run-customer-rehearsal.mjs" ]]; then
  "$NODE" "$SITE/scripts/run-customer-rehearsal.mjs" "$OUT/customer-rehearsal"
  JOURNEY="FICTIONAL_REHEARSAL_COMPLETE"
fi
{
  echo "MAC_STAGED=YES"
  echo "PUBLIC_SITE_TESTS=PASS"
  echo "PRIVATE_BUILDS=$PRIVATE_STATUS"
  echo "AI_PROVIDER_INVENTORY=COMPLETE_NO_API_CALLS"
  echo "LOCAL_INTEGRATION_INVENTORY=COMPLETE_READ_ONLY_NOT_CONNECTED"
  echo "$PROVIDER_COUNTS"
  echo "FULL_CUSTOMER_REHEARSAL=$JOURNEY"
  echo "REAL_CUSTOMER_DELIVERY=HOLD"
  echo "MAC_RUNNING_BOTS_CHANGED=NO"
  echo "NEW_SERVICES_INSTALLED=NO"
  echo "NEW_CHARGES=NONE"
} > "$OUT/ATLAS_BUILD_STATUS.txt"
chmod 600 "$OUT/ATLAS_BUILD_STATUS.txt"
cat "$OUT/ATLAS_BUILD_STATUS.txt"
