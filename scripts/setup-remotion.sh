#!/usr/bin/env bash
# One-shot installer for the Remotion-based shorts pipeline.
# Idempotent — safe to run repeatedly. Heavy first time (~2-5 min) because of
# chromium and the Whisper model download.
#
#   bash scripts/setup-remotion.sh
#
# Env:
#   WHISPER_MODEL  default 'base' (tiny|base|small|medium|large). 'base' is
#                  the speed/accuracy sweet spot for short clips.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

apt_install() {
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq "$@" >/dev/null
}

# 1. node + npm
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "setup-remotion: installing node + npm..."
  apt_install nodejs npm
fi
echo "setup-remotion: node $(node -v), npm $(npm -v)"

# 2. python3 + pip
if ! command -v python3 >/dev/null 2>&1; then
  apt_install python3
fi
if ! command -v pip3 >/dev/null 2>&1; then
  apt_install python3-pip
fi

# 3. Remotion node_modules
if [ ! -d "$ROOT/remotion/node_modules" ]; then
  echo "setup-remotion: installing Remotion node deps (this takes a minute)..."
  (cd "$ROOT/remotion" && npm install --no-fund --no-audit --loglevel=error)
else
  echo "setup-remotion: remotion node_modules already present."
fi

# 4. headless Chromium for Remotion's renderer
echo "setup-remotion: ensuring Remotion's headless Chromium..."
(cd "$ROOT/remotion" && npx --yes remotion browser ensure 2>&1 | tail -3 || true)

# 5. openai-whisper (CPU is fine for short clips)
if ! python3 -c "import whisper" >/dev/null 2>&1; then
  echo "setup-remotion: installing openai-whisper..."
  pip3 install --quiet --break-system-packages openai-whisper 2>/dev/null \
    || pip3 install --quiet openai-whisper
fi

# 6. warm whisper model (optional; skips silently if it fails)
WMODEL="${WHISPER_MODEL:-base}"
echo "setup-remotion: warming whisper model '${WMODEL}'..."
python3 - <<PY 2>/dev/null || echo "setup-remotion: whisper warmup skipped (will download on first use)"
import whisper
whisper.load_model("${WMODEL}")
PY

echo "setup-remotion: done."
