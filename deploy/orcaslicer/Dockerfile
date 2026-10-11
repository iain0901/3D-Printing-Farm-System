FROM node:22-bookworm-slim AS node-runtime
FROM ubuntu:24.04

ARG ORCA_SLICER_VERSION=2.4.2
ARG TARGETARCH=amd64
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libatomic1 libfuse2t64 libglib2.0-0 libgtk-3-0 \
    libx11-6 libxcb1 libxext6 libxrender1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxtst6 libice6 libsm6 libgl1 libopengl0 libglu1-mesa \
    libwebkit2gtk-4.1-0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
RUN test "$TARGETARCH" = "amd64" && \
    curl -fsSL "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v${ORCA_SLICER_VERSION}/OrcaSlicer_Linux_AppImage_Ubuntu2404_V${ORCA_SLICER_VERSION}.AppImage" -o /tmp/orca.AppImage && \
    chmod +x /tmp/orca.AppImage && cd /opt && /tmp/orca.AppImage --appimage-extract && mv squashfs-root orca && rm /tmp/orca.AppImage
RUN ln -s /opt/orca/AppRun /usr/local/bin/orca-slicer && useradd --create-home --uid 10001 orca
WORKDIR /app
COPY --chown=orca:orca package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# Worker helpers are part of the runtime contract, not just the entry point.
COPY --chown=orca:orca api/ /app/api/
USER orca
WORKDIR /home/orca
CMD ["node", "/app/api/orca-worker.mjs"]
