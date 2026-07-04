#!/usr/bin/env bash
# Upload a local file to Cloudinary using a signature fetched from the backend
# (so no Cloudinary secret is needed in this environment). Prints the secure_url.
#
#   scripts/upload.sh media/out/result.mp4
#
# Env:
#   BACKEND   backend base URL (default: the deployed Render service)
set -euo pipefail
FILE="${1:?usage: upload.sh FILE}"
[ -f "$FILE" ] || { echo "error: file not found: $FILE" >&2; exit 1; }
BACKEND="${BACKEND:-https://video-edit-backend.onrender.com}"

SIGN="$(curl -fsS -m 120 -X POST "$BACKEND/api/sign")"
get() { printf '%s' "$SIGN" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
CLOUD="$(get cloudName)"; API_KEY="$(get apiKey)"; TS="$(get timestamp)"
SIG="$(get signature)"; FOLDER="$(get folder)"

RESP="$(curl -fsS -m 600 -X POST "https://api.cloudinary.com/v1_1/$CLOUD/video/upload" \
  -F "file=@$FILE" -F "api_key=$API_KEY" -F "timestamp=$TS" -F "signature=$SIG" -F "folder=$FOLDER")"
URL="$(printf '%s' "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('secure_url',''))")"
[ -n "$URL" ] || { echo "upload failed: $RESP" >&2; exit 1; }
echo "$URL"
