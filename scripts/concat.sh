#!/usr/bin/env bash
# Merge / join multiple clips into one.
#   scripts/concat.sh OUTPUT INPUT1 INPUT2 [INPUT3 ...]
#
# Re-encodes everything to a common format so clips from different
# cameras/phones join cleanly (different resolutions are scaled to the first
# clip's size, letterboxed to keep aspect). Clips with no audio track get a
# silent track synthesized so the join still works.
#
# The output resolution follows the FIRST clip (portrait first = portrait out),
# capped at MAX_DIM on the long side (default 1920: 4K in -> 1080p out) so SNS
# deliverables stay fast to encode and under upload size limits.
#
# Env:
#   MAX_DIM=1920   cap for the long side (0 = keep first clip's full size)
#   CRF=21         x264 quality (lower = better/bigger)
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
n="$#"

# target size from the first input
read -r W H < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0:s=x "$1" | tr 'x' ' ')
[ -n "${W:-}" ] && [ -n "${H:-}" ] || die "could not probe size of first input: $1"

# cap the long side at MAX_DIM (keeps aspect, even dimensions for yuv420p)
MAX_DIM="${MAX_DIM:-1920}"
CRF="${CRF:-21}"
if [ "$MAX_DIM" -gt 0 ]; then
  # note: awk must end with a newline (print, not printf) or read exits
  # non-zero at EOF and set -e kills the script
  read -r W H < <(awk -v w="$W" -v h="$H" -v m="$MAX_DIM" \
    'BEGIN{L=(w>h)?w:h; s=(L>m)?m/L:1; print int(w*s/2)*2, int(h*s/2)*2}')
fi

# real inputs first
args=()
for f in "$@"; do args+=(-i "$f"); done

# audio source per clip: use its own track, or synthesize silence for clips
# that have none (mixing silent + sounded clips would otherwise fail).
declare -a aref
lav="$n"; i=0
for f in "$@"; do
  if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$f" | grep -q .; then
    aref[i]="[${i}:a]"
  else
    dur="$(probe_duration "$f" || echo 1)"
    args+=(-f lavfi -t "${dur:-1}" -i "anullsrc=channel_layout=stereo:sample_rate=44100")
    aref[i]="[${lav}:a]"
    lav=$((lav+1))
  fi
  i=$((i+1))
done

filters=""; maps=""
for ((j=0; j<n; j++)); do
  filters+="[${j}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1,fps=30[v${j}];"
  filters+="${aref[j]}aresample=async=1:first_pts=0[a${j}];"
  maps+="[v${j}][a${j}]"
done
filters+="${maps}concat=n=${n}:v=1:a=1[v][a]"

ffmpeg -y "${args[@]}" -filter_complex "$filters" -map "[v]" -map "[a]" \
  -c:v libx264 -preset veryfast -crf "$CRF" -c:a aac -movflags +faststart "$OUT"
echo "wrote: $OUT"
