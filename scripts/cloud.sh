#!/usr/bin/env bash
# Helpers for the cloud workflow that bypasses chat file-size limits.
#
# Why: phone videos are often too big to attach in chat. Instead, put the
# video in cloud storage (Cloudinary) and let Claude work with URLs.
#
#   INPUT  : the edit scripts already accept an http(s) URL directly, e.g.
#              scripts/cut.sh "https://res.cloudinary.com/.../in.mp4" 5 +10
#            (ffmpeg streams the remote file — no manual download needed).
#
#   OUTPUT : the Cloudinary MCP upload tool runs remotely and CANNOT read
#            local paths, so an edited file must be handed over as a base64
#            data URI. This script prints that data URI for Claude to pass to
#            the `upload-asset` MCP tool's `file` field.
#
# Usage:
#   scripts/cloud.sh datauri media/out/result.mp4 > /tmp/result.datauri
#
# Note: the data URI route is capped at ~47 MB (Cloudinary's ~60 MB base64
# limit). For larger outputs, lower the resolution/bitrate first, or split.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"

cmd="${1:?usage: cloud.sh datauri FILE}"
case "$cmd" in
  datauri)
    f="${2:?file required}"
    [ -f "$f" ] || die "file not found: $f"
    sz=$(stat -c%s "$f")
    max=$((47*1024*1024))
    if [ "$sz" -gt "$max" ]; then
      die "file is $((sz/1024/1024)) MB, over the ~47 MB data-URI limit. Re-encode smaller first."
    fi
    mime="video/mp4"
    case "$f" in
      *.mov) mime="video/quicktime" ;;
      *.webm) mime="video/webm" ;;
      *.mp3) mime="audio/mpeg" ;;
      *.wav) mime="audio/wav" ;;
      *.m4a|*.aac) mime="audio/aac" ;;
      *.png) mime="image/png" ;;
      *.jpg|*.jpeg) mime="image/jpeg" ;;
    esac
    printf 'data:%s;base64,' "$mime"
    base64 -w0 "$f"
    echo
    ;;
  *)
    die "unknown command: $cmd (only 'datauri' supported)"
    ;;
esac
