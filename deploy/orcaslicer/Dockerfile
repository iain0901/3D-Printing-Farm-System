FROM node:22-noble

ARG ORCA_SLICER_VERSION=2.4.2
ARG TARGETARCH
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libfuse2 libglib2.0-0 libgtk-3-0 libx11-6 libxcb1 libxext6 libxrender1 libgl1 && rm -rf /var/lib/apt/lists/*
RUN test "$TARGETARCH" = "amd64" && \
    curl -fsSL "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v${ORCA_SLICER_VERSION}/OrcaSlicer_Linux_AppImage_Ubuntu2404_V${ORCA_SLICER_VERSION}.AppImage" -o /tmp/orca.AppImage && \
    chmod +x /tmp/orca.AppImage && cd /opt && /tmp/orca.AppImage --appimage-extract && mv squashfs-root orca && rm /tmp/orca.AppImage
RUN ln -s /opt/orca/AppRun /usr/local/bin/orca-slicer && useradd --create-home --uid 10001 orca
COPY api/orca-worker.mjs /app/api/orca-worker.mjs
USER orca
WORKDIR /app
CMD ["node", "api/orca-worker.mjs"]
