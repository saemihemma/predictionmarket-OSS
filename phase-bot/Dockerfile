# SDVM Phase Transition Bot — Multi-stage Dockerfile
#
# Builds and deploys the phase transition bot with health checks.
# Usage:
#   docker build -t sdvm-phase-bot .
#   docker run -e SUI_RPC_URL=... -e BOT_KEYPAIR=... -e PM_PACKAGE_ID=... \
#              -p 3000:3000 sdvm-phase-bot

# Stage 1: Builder
FROM node:20-alpine as builder

WORKDIR /build

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Copy package files (production only)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder
COPY --from=builder /build/dist ./dist

# Runtime config
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV HEALTH_PORT=3000
ENV POLL_INTERVAL_MS=60000

# Health check: ping /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose health port
EXPOSE 3000

# Start bot
CMD ["node", "dist/server.js"]
