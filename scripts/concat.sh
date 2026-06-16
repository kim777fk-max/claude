#!/usr/bin/env bash
# Merge / join multiple clips into one.
#   scripts/concat.sh OUTPUT INPUT1 INPUT2 [INPUT3 ...]
#
# Re-encodes everything to a common format so clips from different
# cameras/phones join cleanly (different resolutions are scaled to the first
# clip's size, letterboxed to keep aspect).
#
# Example:
#   scripts/concat.sh media/out/joined.mp4 media/in/a.mp4 media/in/b.mp4
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

OUT="${1:?OUTPUT required}"; shift
[ "$#" -ge 2 ] || die "need at least 2 input clips"
mkdir -p "$(dirname "$OUT")"

# target size from the first input
read -r W H < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0:s=x "$1" | tr 'x' ' ')

inputs=(); filters=""; n=0
for f in "$@"; do
  inputs+=(-i "$f")
  filters+="[${n}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1,fps=30[v${n}];"
  filters+="[${n}:a]aresample=async=1:first_pts=0[a${n}];"
  n=$((n+1))
done
maps=""; for ((i=0;i<n;i++)); do maps+="[v${i}][a${i}]"; done
filters+="${maps}concat=n=${n}:v=1:a=1[v][a]"

ffmpeg -y "${inputs[@]}" -filter_complex "$filters" -map "[v]" -map "[a]" \
  -c:v libx264 -preset veryfast -crf 18 -c:a aac -movflags +faststart "$OUT"
echo "wrote: $OUT"
