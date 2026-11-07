#!/usr/bin/env bash
# ATLAS free local HyperFrames installer; no subscriptions, no AI API calls.
set -Eeuo pipefail
umask 077
if [[ "$(uname -s)" != "Darwin" ]]; then echo "Requires macOS"; exit 2; fi
ROOT="$HOME/ATLAS-OSS"
mkdir -p "$ROOT"/{bin,vendor,projects,logs}
export PATH="$ROOT/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="$ROOT/logs/hyperframes-setup-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
echo "ATLAS free HyperFrames setup | $LOG"
NODEMAJOR=0
if command -v node >/dev/null 2>&1; then
  NODEMAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
fi
if [[ "$NODEMAJOR" -lt 22 ]]; then
  VER=v24.13.0
  case "$(uname -m)" in
    arm64) ARCH=arm64; SHA=d595961e563fcae057d4a0fb992f175a54d97fcc4a14dc2d474d92ddeea3b9f8 ;;
    x86_64) ARCH=x64; SHA=6f03c1b48ddbe1b129a6f8038be08e0899f05f17185b4d3e4350180ab669a7f3 ;;
    *) echo "Unsupported Mac CPU"; exit 3 ;;
  esac
  FILE="node-$VER-darwin-$ARCH.tar.gz"
  DEST="$ROOT/vendor/node-$VER-darwin-$ARCH"
  if [[ ! -x "$DEST/bin/node" ]]; then
    TEMP="$(mktemp -d)"
    trap 'rm -rf "$TEMP"' EXIT
    curl -fLsS --retry 2 "https://nodejs.org/dist/$VER/$FILE" -o "$TEMP/$FILE"
    (cd "$TEMP" && printf '%s  %s\n' "$SHA" "$FILE" | shasum -a 256 -c -)
    tar -xzf "$TEMP/$FILE" -C "$ROOT/vendor"
  fi
  export PATH="$DEST/bin:$PATH"
fi
echo "Node: $(node --version) npm: $(npm --version)"
# npm packages are local to the user's ATLAS directory, not the production stack.
npm install --prefix "$ROOT/vendor/media" --no-audit --no-fund ffmpeg-static ffprobe-static
FFM="$(node -e "process.stdout.write(require('$ROOT/vendor/media/node_modules/ffmpeg-static'))")"
FFP="$(node -e "process.stdout.write(require('$ROOT/vendor/media/node_modules/ffprobe-static').path)")"
[[ -x "$FFM" && -x "$FFP" ]] || { echo "Local FFmpeg unavailable"; exit 4; }
ln -sf "$FFM" "$ROOT/bin/ffmpeg"
ln -sf "$FFP" "$ROOT/bin/ffprobe"
echo "FFmpeg: $(ffmpeg -version | head -n 1)"
npm install --prefix "$ROOT/vendor/hyperframes" --no-audit --no-fund hyperframes@0.9.19
HF="$ROOT/vendor/hyperframes/node_modules/.bin/hyperframes"
"$HF" --help >/dev/null
echo "HyperFrames CLI installed"
if [[ ! -d "$ROOT/projects/first-video" ]]; then
  "$HF" init "$ROOT/projects/first-video" || echo "Scaffold unsuccessful; CLI is still installed"
fi
if [[ -f "$ROOT/projects/first-video/index.html" ]]; then
  (cd "$ROOT/projects/first-video" && "$HF" render -o "$ROOT/projects/first-video.mp4") \
    && echo "MP4 RENDER PASS: $ROOT/projects/first-video.mp4" \
    || echo "Render not verified; inspect $LOG"
fi
echo "No subscriptions, AI generation credits, external accounts, production workflows or scheduled jobs changed."
echo "SETUP FINISHED | LOG: $LOG"
