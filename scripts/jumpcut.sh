#!/usr/bin/env bash
# Detect silence and emit "keep" ranges for jump-cut editing.
#   scripts/jumpcut.sh INPUT OUT_JSON [THRESHOLD_DB] [MIN_SILENCE_SEC]
#
# Defaults are tuned for Vlog talk-style footage (a bit aggressive on pauses):
#   THRESHOLD_DB    -32   (anything below = "silence")
#   MIN_SILENCE_SEC 0.4   (only cut pauses ≥ 0.4s)
#
# Output JSON:
#   { "keep":     [[start,end], ...],
#     "silences": [[start,end], ...] }
# Drop "keep" into clip.keep in props.json.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT required}"
OUT="${2:?OUT_JSON required}"
THDB="${3:--32}"
MIN="${4:-0.4}"

mkdir -p "$(dirname "$OUT")"
DUR="$(probe_duration "$IN")"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

ffmpeg -hide_banner -nostats -i "$IN" -af "silencedetect=noise=${THDB}dB:d=${MIN}" \
  -f null - 2> "$LOG" >/dev/null || true

JC_LOG="$LOG" JC_DUR="$DUR" JC_OUT="$OUT" python3 - <<'PY'
import json, os, re

log_path = os.environ["JC_LOG"]
duration = float(os.environ["JC_DUR"])
out_path = os.environ["JC_OUT"]

silences = []
cur_start = None
for line in open(log_path, encoding="utf-8", errors="ignore"):
    m1 = re.search(r"silence_start:\s+([\d.]+)", line)
    m2 = re.search(r"silence_end:\s+([\d.]+)", line)
    if m1:
        cur_start = float(m1.group(1))
    if m2 and cur_start is not None:
        silences.append((cur_start, float(m2.group(1))))
        cur_start = None

keeps = []
t = 0.0
for a, b in silences:
    if a > t + 0.05:
        keeps.append([round(t, 3), round(a, 3)])
    t = b
if t < duration - 0.05:
    keeps.append([round(t, 3), round(duration, 3)])
if not keeps:
    keeps = [[0.0, round(duration, 3)]]

with open(out_path, "w") as f:
    json.dump({"keep": keeps, "silences": [list(s) for s in silences]}, f)
print(f"jumpcut: {len(keeps)} keep-ranges, {len(silences)} silences -> {out_path}")
PY
