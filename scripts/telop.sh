#!/usr/bin/env bash
# Burn a telop / caption onto the video (Japanese OK).
#   scripts/telop.sh INPUT "テキスト" [OUTPUT] [START] [END]
# Optional START/END (seconds) show the telop only during that window.
#
# Tunables via env:
#   POS=bottom|top|center   FONT=/path.ttf   SIZE=48
#   COLOR=white   BORDER=black   FONTSIZE same as SIZE
#
# Examples:
#   scripts/telop.sh media/in/a.mp4 "本日のまとめ"
#   POS=top SIZE=64 scripts/telop.sh media/in/a.mp4 "オープニング" media/out/op.mp4 0 3
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT required}"
TEXT="${2:?caption text required}"
OUT="${3:-media/out/$(basename "${IN%.*}")_telop.mp4}"
START="${4:-}"
END="${5:-}"
mkdir -p "$(dirname "$OUT")"

[ -f "$FONT" ] || die "font not found: $FONT (set FONT=/path/to.ttf)"

SIZE="${SIZE:-48}"
COLOR="${COLOR:-white}"
BORDER="${BORDER:-black}"
POS="${POS:-bottom}"
case "$POS" in
  top)    XY="x=(w-text_w)/2:y=h*0.08" ;;
  center) XY="x=(w-text_w)/2:y=(h-text_h)/2" ;;
  *)      XY="x=(w-text_w)/2:y=h*0.85" ;;
esac

ESC="$(escape_drawtext "$TEXT")"
DRAW="drawtext=fontfile=${FONT}:text='${ESC}':fontsize=${SIZE}:fontcolor=${COLOR}:borderw=3:bordercolor=${BORDER}:${XY}"
if [ -n "$START" ] && [ -n "$END" ]; then
  DRAW="${DRAW}:enable='between(t,${START},${END})'"
fi

ffmpeg -y -i "$IN" -vf "$DRAW" \
  -c:v libx264 -preset veryfast -crf 18 -c:a copy -movflags +faststart "$OUT"
echo "wrote: $OUT"
