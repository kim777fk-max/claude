#!/usr/bin/env bash
# Extract word-level captions from a video/URL via openai-whisper.
#   scripts/whisper.sh INPUT OUT_JSON [LANG]
#
# Output JSON shape (drop straight into props.caption):
#   { "style": "karaoke", "words": [ {text, start, end}, ... ], "language": "ja" }
#
# Env:
#   WHISPER_MODEL  default 'base' (tiny|base|small|medium|large)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT required}"
OUT="${2:?OUT_JSON required}"
LANG="${3:-ja}"
MODEL="${WHISPER_MODEL:-base}"

python3 -c "import whisper" 2>/dev/null || die "openai-whisper not installed. Run: bash scripts/setup-remotion.sh"

mkdir -p "$(dirname "$OUT")"
TMP_WAV="$(mktemp --suffix=.wav)"
trap 'rm -f "$TMP_WAV"' EXIT

echo "whisper: extracting audio from $IN..."
ffmpeg -y -i "$IN" -ac 1 -ar 16000 "$TMP_WAV" -loglevel error

echo "whisper: transcribing with model=$MODEL lang=$LANG..."
WHISPER_AUDIO="$TMP_WAV" WHISPER_LANG="$LANG" WHISPER_MODEL_NAME="$MODEL" WHISPER_OUT="$OUT" \
python3 - <<'PY'
import json, os
import whisper

audio = os.environ["WHISPER_AUDIO"]
lang  = os.environ["WHISPER_LANG"]
name  = os.environ["WHISPER_MODEL_NAME"]
out   = os.environ["WHISPER_OUT"]

model = whisper.load_model(name)
res = model.transcribe(audio, language=lang, word_timestamps=True, fp16=False)

words = []
for seg in res.get("segments", []):
    for w in seg.get("words", []) or []:
        t = (w.get("word") or "").strip()
        if not t:
            continue
        s = float(w.get("start", 0.0))
        e = float(w.get("end", s))
        words.append({"text": t, "start": round(s, 3), "end": round(max(e, s + 0.05), 3)})

with open(out, "w", encoding="utf-8") as f:
    json.dump(
        {"style": "karaoke", "words": words, "language": lang},
        f,
        ensure_ascii=False,
    )
print(f"whisper: {len(words)} words -> {out}")
PY
