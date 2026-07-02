#!/usr/bin/env bash
# Render a MIDI file to a mastered .m4a using a SoundFont (FluidSynth), with
# tasteful reverb and gentle in/out fades (no abrupt cut).
#
#   scripts/sf_render.sh SOUNDFONT.sf2 IN.mid OUT.m4a [REVERB] [GAIN]
#
#   REVERB = none | light | med | heavy   (default: med)
#   GAIN   = FluidSynth gain (default: 0.7; lower for dense/layered MIDI)
#
# Needs: fluidsynth, ffmpeg. Free SoundFonts: archive.org "free-soundfonts-sf2-2019-04"
# (e.g. FluidR3_GM2, GeneralUser GS). Public-domain MIDI renders are licence-free.
set -euo pipefail
SF="${1:?SoundFont .sf2 required}"
IN="${2:?input .mid required}"
OUT="${3:?output .m4a required}"
REVERB="${4:-med}"
GAIN="${5:-0.7}"

# media/in/ is gitignored, so a fresh web session has no soundfont — fetch the
# default bank on first use instead of failing.
if [ ! -f "$SF" ]; then
  echo "soundfont missing: $SF — downloading FluidR3 GM2 (~148MB, one-time per session)..." >&2
  mkdir -p "$(dirname "$SF")"
  curl -L --fail --retry 3 -o "$SF" \
    "https://archive.org/download/free-soundfonts-sf2-2019-04/FluidR3_GM2-2.SF2"
fi

case "$REVERB" in
  none)  RV="" ;;
  light) RV="aecho=0.85:0.5:90|170:0.22|0.14," ;;
  med)   RV="aecho=0.8:0.5:90|170|260:0.3|0.2|0.12,aecho=0.6:0.4:480:0.14," ;;
  heavy) RV="aecho=0.85:0.6:150|320|480:0.35|0.25|0.16,aecho=0.6:0.4:700:0.16," ;;
  *) echo "unknown reverb: $REVERB" >&2; exit 1 ;;
esac

TMP="$(mktemp --suffix=.wav)"
trap 'rm -f "$TMP"' EXIT
fluidsynth -ni -g "$GAIN" -r 44100 -F "$TMP" "$SF" "$IN" >/dev/null 2>&1

DUR="$(ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "$TMP")"
ST="$(awk -v d="$DUR" 'BEGIN{printf "%.2f",(d-4>0)?d-4:0}')"
ffmpeg -y -i "$TMP" -af \
  "highpass=f=35,lowpass=f=13000,${RV}acompressor=threshold=-20dB:ratio=3:attack=12:release=220,afade=t=in:st=0:d=0.1,afade=t=out:st=${ST}:d=4,loudnorm=I=-14:TP=-1.5,aformat=channel_layouts=stereo" \
  "$OUT" >/dev/null 2>&1
echo "wrote: $OUT (${DUR}s, reverb=$REVERB)"
