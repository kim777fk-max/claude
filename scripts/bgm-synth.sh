#!/usr/bin/env bash
# Synthesize a soft ambient pad BGM as fallback when no library track matches.
#   scripts/bgm-synth.sh OUT [DURATION_SEC]
# Outputs an MP3.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

OUT="${1:?OUT required}"
DUR="${2:-30}"
mkdir -p "$(dirname "$OUT")"

mk_chord() {
  local out="$1"; shift
  local inputs=() maps="" n=0
  for f in "$@"; do
    inputs+=(-f lavfi -t 4.2 -i "sine=frequency=${f}:sample_rate=44100")
    maps+="[${n}:a]"; n=$((n+1))
  done
  ffmpeg -y "${inputs[@]}" -filter_complex \
    "${maps}amix=inputs=${n}:normalize=1,tremolo=f=5:d=0.4,lowpass=f=2600,afade=t=in:st=0:d=0.6,afade=t=out:st=3.6:d=0.6,volume=2.0[a]" \
    -map "[a]" -ac 2 -ar 44100 "$out" -loglevel error
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mk_chord "$TMP/c.wav"  130.81 261.63 329.63 392.00   # C major
mk_chord "$TMP/am.wav" 110.00 220.00 261.63 329.63   # A minor

# each chord = 4.2s, pair = 8.4s
PAIRS="$(python3 -c "import math; print(max(1, math.ceil($DUR / 8.4)))")"
LIST="$TMP/list.txt"
: > "$LIST"
for ((i=0; i<PAIRS; i++)); do
  printf "file '%s'\nfile '%s'\n" "$TMP/c.wav" "$TMP/am.wav" >> "$LIST"
done

ffmpeg -y -f concat -safe 0 -i "$LIST" -t "$DUR" -c:a libmp3lame -q:a 4 "$OUT" -loglevel error
echo "wrote: $OUT"
