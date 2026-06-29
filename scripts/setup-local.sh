#!/usr/bin/env bash
# Local setup (macOS / Linux) so the whole toolkit runs on your own machine:
#   - video edit (cut/concat/telop/music)         -> ffmpeg
#   - MIDI -> any timbre (organ/piano/8bit/...)    -> fluidsynth + a SoundFont
#   - procedural BGM / expression                  -> python3 + numpy + mido
#   - singing (Sinsy) and Cloudinary upload        -> curl + internet (no secrets)
#
# Run once:  bash scripts/setup-local.sh
# Unlike scripts/setup.sh (web/apt only), this auto-detects Homebrew or apt.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SF_DIR="$DIR/media/in"
SF="$SF_DIR/fluidr3.sf2"
mkdir -p "$SF_DIR"

have(){ command -v "$1" >/dev/null 2>&1; }

echo "==> installing system deps (ffmpeg, fluidsynth)"
if have brew; then
  brew install ffmpeg fluid-synth python3 || true
elif have apt-get; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq ffmpeg fluidsynth python3 python3-pip fonts-noto-cjk || true
else
  echo "!! No brew/apt found. Install ffmpeg + fluidsynth manually, then re-run." >&2
fi

echo "==> installing python deps (numpy, mido)"
python3 -m pip install --quiet --user numpy mido || pip3 install --quiet numpy mido || true

echo "==> fetching a free SoundFont (FluidR3 GM2, ~148MB) for realistic instruments"
if [ ! -f "$SF" ]; then
  curl -L --fail --retry 3 -o "$SF" \
    "https://archive.org/download/free-soundfonts-sf2-2019-04/FluidR3_GM2-2.SF2" \
    && echo "   saved: $SF" \
    || echo "!! soundfont download failed; grab any .sf2 and point sf_render.sh at it"
else
  echo "   already present: $SF"
fi

echo
echo "==> done. Quick checks:"
for c in ffmpeg fluidsynth python3; do printf "   %-10s %s\n" "$c" "$(command -v $c || echo MISSING)"; done
python3 - <<'PY' 2>/dev/null || true
import importlib
print("   numpy/mido", [m for m in ("numpy","mido") if importlib.util.find_spec(m)])
PY
cat <<'EOF'

Examples (run from repo root):
  scripts/concat.sh out.mp4 in1.mp4 in2.mp4
  python3 scripts/midi_arrange.py song.mid song_piano.mid piano
  scripts/sf_render.sh media/in/fluidr3.sf2 song_piano.mid song_piano.m4a med
  python3 scripts/midi_render_synth.py song.mid song_8bit.wav chiptune   # no SoundFont needed

Notes:
  - Cloudinary upload (scripts/upload.sh) works as-is: it gets a signed signature
    from the hosted backend, so no API secret is needed locally.
  - Singing (Sinsy) is a web API over curl; just needs internet.
  - For telop.sh on macOS, pass a Japanese font path via FONT=... if needed.
EOF
