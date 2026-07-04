#!/usr/bin/env bash
# Cut / trim a clip.
#   scripts/cut.sh INPUT START END [OUTPUT]
# START/END accept seconds (12.5) or timestamps (00:01:05).
# END can be a duration if prefixed with "+", e.g. +10 = 10s from START.
#
# Env:
#   MAX_DIM=1920   cap for the long side (0 = keep source resolution)
#   CRF=21         x264 quality (lower = better/bigger)
#
# Examples:
#   scripts/cut.sh media/in/a.mp4 00:00:05 00:00:20            # keep 5s..20s
#   scripts/cut.sh media/in/a.mp4 5 +10 media/out/clip.mp4     # 10s from 5s
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT required}"
START="${2:?START required}"
END="${3:?END required (timestamp, or +duration)}"
OUT="${4:-media/out/$(basename "${IN%.*}")_cut.mp4}"
mkdir -p "$(dirname "$OUT")"

MAX_DIM="${MAX_DIM:-1920}"
CRF="${CRF:-21}"
# shrink-only cap on the long side (min(iw,MAX) never upscales small sources)
VF="scale=w='min(iw,${MAX_DIM})':h='min(ih,${MAX_DIM})':force_original_aspect_ratio=decrease:force_divisible_by=2"
[ "$MAX_DIM" -gt 0 ] || VF="null"

if [[ "$END" == +* ]]; then
  # duration form
  ffmpeg -y -ss "$START" -i "$IN" -t "${END#+}" -vf "$VF" \
    -c:v libx264 -preset veryfast -crf "$CRF" -c:a aac -movflags +faststart "$OUT"
else
  ffmpeg -y -ss "$START" -to "$END" -i "$IN" -vf "$VF" \
    -c:v libx264 -preset veryfast -crf "$CRF" -c:a aac -movflags +faststart "$OUT"
fi
echo "wrote: $OUT"
