#!/usr/bin/env bash
# Installs ffmpeg + Japanese-capable fonts + the BGM toolchain
# (fluidsynth, python mido/numpy). Safe to run repeatedly.
# Used by the SessionStart hook so every Claude Code (web) session is ready.
#
# The FluidR3 SoundFont (~148MB) is NOT fetched here to keep session start
# fast — scripts/sf_render.sh downloads it automatically on first use.
set -euo pipefail

have_py() { python3 -c "import $1" >/dev/null 2>&1; }

if command -v ffmpeg >/dev/null 2>&1 && command -v fluidsynth >/dev/null 2>&1 \
  && fc-list :lang=ja 2>/dev/null | grep -q . \
  && have_py mido && have_py numpy; then
  echo "setup: ffmpeg, fluidsynth, fonts and python deps already present."
  exit 0
fi

echo "setup: installing ffmpeg + fonts + BGM tools (once per session)..."
export DEBIAN_FRONTEND=noninteractive

# Prefer sudo when available (non-root), otherwise run directly (root container).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

$SUDO apt-get update -qq
$SUDO apt-get install -y -qq ffmpeg fonts-noto-cjk fonts-ipafont-gothic fluidsynth >/dev/null

# MIDI + synthesis deps for the BGM scripts (midi_arrange / midi_express /
# midi_render_synth / musicbox_gen / battle_bgm)
python3 -m pip install --quiet mido numpy 2>/dev/null \
  || python3 -m pip install --quiet --break-system-packages mido numpy

echo "setup: done. ffmpeg = $(ffmpeg -version 2>/dev/null | head -1)"
echo "setup: fluidsynth = $(fluidsynth --version 2>/dev/null | head -1)"
