#!/usr/bin/env bash
# Final delivery step in one command: check size -> auto-compress if over the
# Cloudinary per-file limit -> upload -> print the share URL and the
# save-to-Photos link (markdown-ready).
#
#   scripts/deliver.sh FILE
#
# Env:
#   MAX_MB=95        compress when the file exceeds this (free plan cap ~100MB)
#   SAVE_BASE=...    save-page base URL
#
# Output lines (parse-friendly):
#   URL=...     uploaded secure_url
#   SAVE=...    tappable save-to-Photos page
#   MD=...      ready-to-paste markdown link line
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

FILE="${1:?usage: deliver.sh FILE}"
[ -f "$FILE" ] || die "file not found: $FILE"
MAX_MB="${MAX_MB:-95}"
SAVE_BASE="${SAVE_BASE:-https://kim777fk-max.github.io/claude/save.html}"

size_mb() { du -m "$1" | cut -f1; }

SZ="$(size_mb "$FILE")"
if [ "$SZ" -gt "$MAX_MB" ]; then
  echo "size ${SZ}MB > ${MAX_MB}MB — compressing..." >&2
  SMALL="${FILE%.*}_small.mp4"
  ffmpeg -y -i "$FILE" -c:v libx264 -crf 26 -preset veryfast \
    -c:a aac -b:a 160k -movflags +faststart "$SMALL" >/dev/null 2>&1
  # still too big (very long/complex video): one harder pass with 720p cap
  if [ "$(size_mb "$SMALL")" -gt "$MAX_MB" ]; then
    ffmpeg -y -i "$FILE" -vf "scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2" \
      -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 128k -movflags +faststart "$SMALL" >/dev/null 2>&1
  fi
  echo "compressed: ${SZ}MB -> $(size_mb "$SMALL")MB" >&2
  FILE="$SMALL"
fi

URL="$("$DIR/upload.sh" "$FILE")"
ENC="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$URL")"
echo "URL=$URL"
echo "SAVE=${SAVE_BASE}?u=${ENC}"
echo "MD=[📥 写真に保存](${SAVE_BASE}?u=${ENC}) ／ [▶ 再生](${URL})"
