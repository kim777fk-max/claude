#!/usr/bin/env bash
# Shared helpers for the video scripts.
set -euo pipefail

# Default Japanese font for telop. Override with FONT=/path/to.ttf
DEFAULT_FONT="/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
FONT="${FONT:-$DEFAULT_FONT}"

die() { echo "error: $*" >&2; exit 1; }

need_ffmpeg() {
  command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg not found. Run scripts/setup.sh first."
}

# escape text for ffmpeg drawtext (: ' \ % and newlines)
escape_drawtext() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//:/\\:}"
  s="${s//\'/\\\'}"
  s="${s//%/\\%}"
  printf '%s' "$s"
}

# probe duration in seconds (float)
probe_duration() {
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"
}
