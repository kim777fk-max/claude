#!/usr/bin/env bash
# Turn a still image (jpg/png, local file or URL) into a video clip so it can
# be concatenated with real footage. The canvas is filled with a blurred copy
# of the image; the photo itself is fitted inside (any aspect ratio works).
#
#   scripts/imgclip.sh IMAGE [OUTPUT] [SECONDS]
#
# Env:
#   SIZE=1920x1080   canvas (use 1080x1920 for vertical shorts)
#   BLUR=20          background blur strength
#   CRF=22           x264 quality
#
# Examples:
#   scripts/imgclip.sh media/in/photo.jpg                       # 5s, 1080p
#   SIZE=1080x1920 scripts/imgclip.sh "URL" media/out/p1.mp4 4  # 4s vertical
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?IMAGE required}"
OUT="${2:-media/out/$(basename "${IN%.*}")_clip.mp4}"
SECONDS_LEN="${3:-5}"
mkdir -p "$(dirname "$OUT")"

SIZE="${SIZE:-1920x1080}"
W="${SIZE%x*}"; H="${SIZE#*x}"
BLUR="${BLUR:-20}"
CRF="${CRF:-22}"

ffmpeg -y -loop 1 -t "$SECONDS_LEN" -i "$IN" -filter_complex \
  "[0]split[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${BLUR}:2[bgb];[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p" \
  -r 30 -an -c:v libx264 -preset veryfast -crf "$CRF" -movflags +faststart "$OUT"
echo "wrote: $OUT"
