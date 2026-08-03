# ── Frontend Dockerfile ─────────────────────────────────────
# Multi-stage: build React app, then serve with Nginx

# Stage 1: Build the React app
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json package-lock.json ./
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000 && \
    npm install --no-audit --no-fund

# Copy source and build
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_API_BASE_URL="/api"
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build


# Stage 2: Serve with Nginx
FROM nginx:alpine AS runtime

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
