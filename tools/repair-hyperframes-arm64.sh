#!/usr/bin/env bash
# Repair Apple Silicon FFprobe for the existing free HyperFrames installation.
# No paid services, no API calls, no production changes.
set -Eeuo pipefail
umask 077
ROOT="$HOME/ATLAS-OSS"
MEDIA="$ROOT/vendor/media"
PROJECT="$ROOT/projects/first-video"
HF="$ROOT/vendor/hyperframes/node_modules/.bin/hyperframes"
NODEDIR="$ROOT/vendor/node-v24.13.0-darwin-arm64/bin"
mkdir -p "$ROOT/bin" "$ROOT/logs"
LOG="$ROOT/logs/hyperframes-arm64-repair-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== ATLAS FREE VIDEO / APPLE SILICON REPAIR ==="
[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || { echo "This fix is specific to Apple Silicon Macs"; exit 2; }
export PATH="$NODEDIR:$ROOT/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
command -v npm >/dev/null || { echo "Node/npm missing; original setup incomplete"; exit 3; }
[[ -x "$HF" ]] || { echo "HyperFrames missing; original setup incomplete"; exit 4; }
[[ -d "$PROJECT" ]] || { echo "First-video project missing"; exit 5; }

echo "Installing native ARM64 FFprobe in the existing local media directory..."
npm install --prefix "$MEDIA" --no-audit --no-fund '@ffprobe-installer/ffprobe@2.1.2'
PROBE="$(node -e 'const p=require(process.argv[1]);process.stdout.write(p.path)' "$MEDIA/node_modules/@ffprobe-installer/ffprobe")"
[[ -x "$PROBE" ]] || { echo "FFprobe executable missing at $PROBE"; exit 6; }
echo "FFprobe file type: $(file "$PROBE")"
file "$PROBE" | grep -qi arm64 || { echo "FFprobe is not native ARM64; refusing to use it"; exit 7; }
"$PROBE" -version | head -n 1
ln -sfn "$PROBE" "$ROOT/bin/ffprobe"
export HYPERFRAMES_FFPROBE_PATH="$PROBE"

FFMPEG="$(node -e 'const p=require(process.argv[1]);process.stdout.write(p)' "$MEDIA/node_modules/ffmpeg-static")"
[[ -x "$FFMPEG" ]] || { echo "FFmpeg unavailable"; exit 8; }
export HYPERFRAMES_FFMPEG_PATH="$FFMPEG"
echo "FFmpeg: $("$FFMPEG" -version | head -n 1)"

# Persistent launcher for future SSH sessions and unattended video renders.
# Keeps architecture-specific media paths available without changing system PATH.
cat > "$ROOT/bin/atlas-hyperframes" <<'ATLAS_LAUNCHER'
#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$HOME/ATLAS-OSS"
export PATH="$ROOT/vendor/node-v24.13.0-darwin-arm64/bin:$ROOT/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export HYPERFRAMES_FFMPEG_PATH="$(node -e 'process.stdout.write(require(process.argv[1]))' "$ROOT/vendor/media/node_modules/ffmpeg-static")"
export HYPERFRAMES_FFPROBE_PATH="$(node -e 'process.stdout.write(require(process.argv[1]).path)' "$ROOT/vendor/media/node_modules/@ffprobe-installer/ffprobe")"
exec "$ROOT/vendor/hyperframes/node_modules/.bin/hyperframes" "$@"
ATLAS_LAUNCHER
chmod 700 "$ROOT/bin/atlas-hyperframes"
HF="$ROOT/bin/atlas-hyperframes"
echo "Persistent launcher: $HF"

echo "Disabling nonessential HyperFrames telemetry..."
"$HF" telemetry disable || true

echo "Checking browser and rendering prerequisites..."
"$HF" browser ensure
(cd "$PROJECT" && "$HF" doctor --json > "$ROOT/logs/hyperframes-doctor-after-repair.json" 2>&1) || true

OUTPUT="$PROJECT/atlas-first-test.mp4"
echo "Rendering local test: $OUTPUT"
(cd "$PROJECT" && "$HF" render -o "$OUTPUT")
[[ -s "$OUTPUT" ]] || { echo "FAIL: no playable MP4 was produced"; exit 9; }
echo "FFprobe media validation:"
"$PROBE" -v error -show_entries format=duration,size:stream=codec_name,width,height -of json "$OUTPUT"
echo "SUCCESS: MP4 created at $OUTPUT"
echo "LOG: $LOG"
echo "COST: £0; no AI generation credits or paid subscriptions used."
