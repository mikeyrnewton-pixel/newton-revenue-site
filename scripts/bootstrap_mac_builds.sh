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
JOURNEY="NOT_IN_MERGED_MAIN"
if [[ -f "$SITE/scripts/run-customer-rehearsal.mjs" ]]; then
  "$NODE" "$SITE/scripts/run-customer-rehearsal.mjs" "$OUT/customer-rehearsal"
  JOURNEY="FICTIONAL_REHEARSAL_COMPLETE"
fi
{
  echo "MAC_STAGED=YES"
  echo "PUBLIC_SITE_TESTS=PASS"
  echo "PRIVATE_BUILDS=$PRIVATE_STATUS"
  echo "FULL_CUSTOMER_REHEARSAL=$JOURNEY"
  echo "REAL_CUSTOMER_DELIVERY=HOLD"
  echo "MAC_RUNNING_BOTS_CHANGED=NO"
  echo "NEW_SERVICES_INSTALLED=NO"
  echo "NEW_CHARGES=NONE"
} > "$OUT/ATLAS_BUILD_STATUS.txt"
chmod 600 "$OUT/ATLAS_BUILD_STATUS.txt"
cat "$OUT/ATLAS_BUILD_STATUS.txt"
