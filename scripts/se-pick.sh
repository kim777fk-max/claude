#!/usr/bin/env bash
# Pick an SE URL from assets/se-manifest.json by tag (case-insensitive).
#   scripts/se-pick.sh TAG
#
# Prints the public URL or nothing (exit 0) if no match — caller should drop
# the SE entry when stdout is empty.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
MANIFEST="${SE_MANIFEST:-$ROOT/assets/se-manifest.json}"

TAG="${1:?TAG required}"
[ -f "$MANIFEST" ] || { exit 0; }

SE_MANIFEST="$MANIFEST" SE_TAG="$TAG" python3 - <<'PY'
import json, os, random
try:
    m = json.load(open(os.environ["SE_MANIFEST"]))
except Exception:
    raise SystemExit(0)
tag = os.environ["SE_TAG"].lower()
hits = []
for e in m.get("effects", []):
    tags = [x.lower() for x in e.get("tags", [])]
    if tag in tags or any(tag in tt for tt in tags):
        hits.append(e)
if hits:
    print(random.choice(hits)["url"])
PY
