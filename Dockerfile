# Build stage
FROM node:20-slim AS builder

# Install system dependencies required for @napi-rs/canvas
# Retry logic to handle transient network errors
RUN set -e; \
    for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --fix-missing \
            build-essential \
            libcairo2-dev \
            libpango1.0-dev \
            libjpeg-dev \
            libgif-dev \
            librsvg2-dev && \
        break || sleep 5; \
    done && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and assets
COPY . .

# Build TypeScript
RUN npm run build
 
# Prepare production node_modules (built in builder so native bindings are present)
RUN npm ci --omit=dev && \
    rm -rf /root/.npm

# Production stage
FROM node:20-slim

# Install runtime dependencies for @napi-rs/canvas
# Retry logic to handle transient network errors
RUN set -e; \
    for i in 1 2 3; do \
        apt-get update && \
        apt-get install -y --fix-missing \
            libcairo2 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libjpeg62-turbo \
            libgif7 \
            librsvg2-2 && \
        break || sleep 5; \
    done && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and prebuilt node_modules from builder (includes native canvas)
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets

# Expose port
EXPOSE 3000

# Set environment variable to ensure app listens on all interfaces
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]