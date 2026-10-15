# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .

# Build arguments for environment configuration
ARG VITE_API_URL=http://localhost:3000
ARG VITE_NETWORK=testnet
ARG VITE_SENTRY_DSN=""

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_NETWORK=$VITE_NETWORK
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Type check and build
RUN npm run typecheck
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=2s \
  CMD wget -qO- http://127.0.0.1/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]