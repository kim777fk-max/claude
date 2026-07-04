#!/usr/bin/env bash
# Render a Remotion composition from a props.json and upload to Cloudinary.
#   scripts/shorts.sh OUT PROPS_JSON
#
# Picks composition based on PROPS_JSON.format:
#   shorts | reels       → Shorts        (1080x1920)
#   yt-long | yt-square  → YouTubeLong   (1920x1080 or override)
#
# Prints the final Cloudinary secure_url on the last line.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

OUT="${1:?OUT required}"
PROPS="${2:?PROPS_JSON required}"
[ -f "$PROPS" ] || die "props file not found: $PROPS"
mkdir -p "$(dirname "$OUT")"
PROPS_ABS="$(cd "$(dirname "$PROPS")" && pwd)/$(basename "$PROPS")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

[ -d "$ROOT/remotion/node_modules" ] || die "remotion not set up. Run: bash scripts/setup-remotion.sh"

FORMAT="$(PROPS_PATH="$PROPS_ABS" python3 -c "import json,os; print(json.load(open(os.environ['PROPS_PATH'])).get('format','shorts'))")"
case "$FORMAT" in
  shorts|reels)        COMP="Shorts" ;;
  yt-long|yt-square|youtube|long) COMP="YouTubeLong" ;;
  *) die "unknown format: $FORMAT" ;;
esac

RAW="$ROOT/media/out/_remotion_raw.mp4"
echo "shorts: rendering $COMP -> $RAW"
(
  cd "$ROOT/remotion"
  npx --yes remotion render "$COMP" "$RAW" \
    --props="$PROPS_ABS" \
    --concurrency="${REMOTION_CONCURRENCY:-1}" \
    --jpeg-quality="${REMOTION_JPEG_QUALITY:-90}" \
    --crf="${REMOTION_CRF:-20}" \
    --log="${REMOTION_LOG:-info}"
)

echo "shorts: optimizing -> $OUT_ABS"
ffmpeg -y -i "$RAW" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$OUT_ABS" -loglevel error

echo "shorts: uploading to Cloudinary..."
URL="$("$DIR/upload.sh" "$OUT_ABS")"
echo "$URL"
