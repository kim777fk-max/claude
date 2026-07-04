# Backend image for the auto-edit server (server/) — bundles ffmpeg, Japanese
# fonts, the edit scripts, and the Node app. Deploy on Render / Fly / Cloud Run
# or run locally with docker.
FROM node:20-bookworm-slim

# ffmpeg for editing; IPA + Noto CJK so telop renders Japanese.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-ipafont-gothic fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend deps first (better layer caching).
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# App code: scripts/ (called by runPlan) + server/.
COPY scripts ./scripts
COPY server ./server
RUN mkdir -p media/out

# Platforms inject $PORT (Cloud Run uses 8080); the server respects it.
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/server.js"]
