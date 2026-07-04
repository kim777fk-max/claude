#!/usr/bin/env bash
# Add background music to a video (mixes with existing audio, or replaces it).
#   scripts/music.sh INPUT MUSIC [OUTPUT]
#
# Tunables via env:
#   MODE=mix|replace     (default mix: keep original audio + BGM)
#   MUSIC_VOL=0.25       BGM volume (0..1, default 0.25)
#   VOICE_VOL=1.0        original audio volume when mixing
#   FADE=2               fade-out seconds at the end of the video (0 = off)
#
# Music loops automatically if shorter than the video; trimmed to video length.
#
# Examples:
#   scripts/music.sh media/in/a.mp4 media/in/bgm.mp3
#   MODE=replace MUSIC_VOL=0.4 scripts/music.sh media/in/a.mp4 media/in/bgm.mp3 media/out/withbgm.mp4
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"
need_ffmpeg

IN="${1:?INPUT video required}"
MUSIC="${2:?MUSIC file required}"
OUT="${3:-media/out/$(basename "${IN%.*}")_bgm.mp4}"
mkdir -p "$(dirname "$OUT")"

MODE="${MODE:-mix}"
MUSIC_VOL="${MUSIC_VOL:-0.25}"
VOICE_VOL="${VOICE_VOL:-1.0}"
FADE="${FADE:-2}"

DUR="$(probe_duration "$IN")"
fade_filter=""
# awk handles decimals (FADE=0.5); string-stripping "${FADE%.*}" would wrongly
# treat any value below 1 as zero and silently disable the fade.
if [ -n "$DUR" ] && awk -v f="$FADE" 'BEGIN{exit !(f>0)}'; then
  st="$(awk -v d="$DUR" -v f="$FADE" 'BEGIN{printf "%.3f", (d-f>0)?d-f:0}')"
  fade_filter=",afade=t=out:st=${st}:d=${FADE}"
fi

# does the source have audio?
HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$IN" | head -1 || true)"

if [ "$MODE" = "replace" ] || [ -z "$HAS_AUDIO" ]; then
  ffmpeg -y -i "$IN" -stream_loop -1 -i "$MUSIC" \
    -filter_complex "[1:a]volume=${MUSIC_VOL}${fade_filter}[bg]" \
    -map 0:v -map "[bg]" -t "$DUR" \
    -c:v copy -c:a aac -movflags +faststart "$OUT"
else
  ffmpeg -y -i "$IN" -stream_loop -1 -i "$MUSIC" \
    -filter_complex "[0:a]volume=${VOICE_VOL}[v];[1:a]volume=${MUSIC_VOL}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=3${fade_filter}[a]" \
    -map 0:v -map "[a]" -t "$DUR" \
    -c:v copy -c:a aac -movflags +faststart "$OUT"
fi
echo "wrote: $OUT"
