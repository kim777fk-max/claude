#!/usr/bin/env bash
# Installs ffmpeg + Japanese-capable fonts. Safe to run repeatedly.
# Used by the SessionStart hook so every Claude Code (web) session is ready.
set -euo pipefail

if command -v ffmpeg >/dev/null 2>&1 && fc-list :lang=ja >/dev/null 2>&1 \
  && fc-list :lang=ja 2>/dev/null | grep -q .; then
  echo "setup: ffmpeg and Japanese fonts already present."
  exit 0
fi

echo "setup: installing ffmpeg + fonts (this only happens once per session)..."
export DEBIAN_FRONTEND=noninteractive

# Prefer sudo when available (non-root), otherwise run directly (root container).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

$SUDO apt-get update -qq
$SUDO apt-get install -y -qq ffmpeg fonts-noto-cjk fonts-ipafont-gothic >/dev/null

echo "setup: done. ffmpeg = $(ffmpeg -version 2>/dev/null | head -1)"
