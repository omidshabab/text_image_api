# Build stage
FROM node:20-slim AS builder

# Install system dependencies required for @napi-rs/canvas
# Retry logic to handle transient network errors (502 Bad Gateway, etc.)
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update || true && \
    for i in 1 2 3 4 5; do \
        if apt-get install -y --no-install-recommends --fix-missing \
            build-essential \
            python3 \
            libcairo2-dev \
            libpango1.0-dev \
            libjpeg-dev \
            libgif-dev \
            librsvg2-dev \
            libharfbuzz-dev \
            libicu-dev \
            pkg-config; then \
            break; \
        else \
            echo "Attempt $i failed, retrying in 10 seconds..."; \
            sleep 10; \
            apt-get update || true; \
        fi; \
    done && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
# Ensure devDependencies are installed by not setting NODE_ENV=production
RUN npm ci --no-audit

# Copy source code and assets
COPY . .

# Build TypeScript - use explicit path to node_modules/.bin/tsc to avoid npx resolving wrong package
RUN ./node_modules/.bin/tsc && cp -r assets dist/

# Production stage
FROM node:20-slim

# Install runtime dependencies for @napi-rs/canvas
# Retry logic to handle transient network errors (502 Bad Gateway, etc.)
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update || true && \
    for i in 1 2 3 4 5; do \
        if apt-get install -y --no-install-recommends --fix-missing \
            libcairo2 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libjpeg62-turbo \
            libgif7 \
            librsvg2-2 \
            libharfbuzz0b \
            libicu72; then \
            break; \
        else \
            echo "Attempt $i failed, retrying in 10 seconds..."; \
            sleep 10; \
            apt-get update || true; \
        fi; \
    done && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy prebuilt node_modules from builder (includes native canvas bindings)
# The native modules are already compiled in the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Clean up to reduce image size (remove dev dependencies)
# Using npm prune is safe here as native modules are already built
RUN npm prune --production && \
    rm -rf /root/.npm /tmp/* /var/tmp/*

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