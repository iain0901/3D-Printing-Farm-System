FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV LAYERPILOT_HOST=0.0.0.0
ENV LAYERPILOT_API_PORT=8797
ENV LAYERPILOT_SERVE_STATIC=true
ENV LAYERPILOT_DB_PATH=/data/layerpilot.db.json
ENV LAYERPILOT_STORAGE_DIR=/data/storage

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node api ./api
COPY --chown=node:node --from=build /app/dist ./dist

RUN mkdir -p /data/storage && chown -R node:node /app /data
VOLUME ["/data"]
EXPOSE 8797
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const port=process.env.LAYERPILOT_API_PORT||8797; fetch(`http://127.0.0.1:${port}/api/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
