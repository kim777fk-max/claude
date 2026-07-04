#!/usr/bin/env bash
# Convert a clip to vertical 9:16 (YouTube Shorts / Reels / TikTok).
# The frame is filled with a blurred copy of itself; the original video is
# fitted inside untouched (works for landscape and 4K sources alike).
#
#   scripts/vertical.sh INPUT [OUTPUT] [START] [DURATION]
#
# Env:
#   SIZE=1080x1920   output canvas
#   BLUR=24          background blur strength
#   CRF=22           x264 quality
#
# Examples:
#   scripts/vertical.sh media/in/a.mp4                          # whole clip
#   scripts/vertical.sh "URL" media/out/v1.mp4 5 10             # 10s from 5s
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT required}"
OUT="${2:-media/out/$(basename "${IN%.*}")_916.mp4}"
START="${3:-}"
DURATION="${4:-}"
mkdir -p "$(dirname "$OUT")"

SIZE="${SIZE:-1080x1920}"
W="${SIZE%x*}"; H="${SIZE#*x}"
BLUR="${BLUR:-24}"
CRF="${CRF:-22}"

seek=(); [ -n "$START" ] && seek+=(-ss "$START")
lim=();  [ -n "$DURATION" ] && lim+=(-t "$DURATION")

ffmpeg -y "${seek[@]}" -i "$IN" "${lim[@]}" -filter_complex \
  "[0:v]split[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${BLUR}:2[bgb];[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[v]" \
  -map "[v]" -map 0:a:0? -c:v libx264 -preset veryfast -crf "$CRF" -pix_fmt yuv420p \
  -c:a aac -ar 48000 -movflags +faststart "$OUT"
echo "wrote: $OUT"
