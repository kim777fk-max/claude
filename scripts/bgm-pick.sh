#!/usr/bin/env bash
# Pick a BGM URL from assets/bgm-manifest.json by tag (case-insensitive).
#   scripts/bgm-pick.sh TAG [DURATION_SEC]
#   scripts/bgm-pick.sh --synth [DURATION_SEC]
#
# Prints a public URL on stdout. If no tag matches (or --synth is given), it
# synthesizes a soft ambient pad, uploads it to Cloudinary, and prints that URL.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
MANIFEST="${BGM_MANIFEST:-$ROOT/assets/bgm-manifest.json}"

TAG="${1:-}"
DUR="${2:-30}"
FORCE_SYNTH=""
if [ "$TAG" = "--synth" ]; then FORCE_SYNTH=1; TAG=""; fi

URL=""
if [ -z "$FORCE_SYNTH" ] && [ -n "$TAG" ] && [ -f "$MANIFEST" ]; then
  URL="$(BGM_MANIFEST="$MANIFEST" BGM_TAG="$TAG" python3 - <<'PY'
import json, os, random
try:
    m = json.load(open(os.environ["BGM_MANIFEST"]))
except Exception:
    raise SystemExit(0)
tag = os.environ["BGM_TAG"].lower()
hits = []
for t in m.get("tracks", []):
    tags = [x.lower() for x in t.get("tags", [])]
    if tag in tags or any(tag in tt for tt in tags):
        hits.append(t)
if hits:
    print(random.choice(hits)["url"])
PY
)"
fi

if [ -z "$URL" ]; then
  echo "bgm-pick: no manifest match for '${TAG:-(empty)}' — synthesizing soft pad" >&2
  OUT="$ROOT/media/out/_bgm_synth.mp3"
  bash "$DIR/bgm-synth.sh" "$OUT" "$DUR" >&2
  URL="$("$DIR/upload.sh" "$OUT")"
fi
echo "$URL"
