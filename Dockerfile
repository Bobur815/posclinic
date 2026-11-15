# posclinic cloud server + clinic web dashboard (one image; the dashboard is served at /web).
# The Electron till is NOT built here.

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl
# The root package.json also carries the Electron till; its 100+ MB binary is never needed here.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build:server

# Dashboard (src/web has its own package.json); Vite outDir ../../dist/web → /app/dist/web
WORKDIR /app/src/web
RUN npm ci --legacy-peer-deps && npm run build
WORKDIR /app

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat su-exec

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist/server ./dist/server
COPY --from=builder --chown=node:node /app/dist/web ./dist/web
COPY --from=builder --chown=node:node /app/prisma ./prisma

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=3012
EXPOSE 3012

HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/server/main.js"]
