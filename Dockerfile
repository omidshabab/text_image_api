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
# Use npm install instead of npm ci to ensure all dependencies are properly installed
# Explicitly install TypeScript to ensure it's available
RUN npm install --no-audit && \
    echo "Verifying TypeScript installation..." && \
    if [ ! -d node_modules/typescript ]; then \
        echo "TypeScript not found after npm install, installing explicitly..." && \
        npm install typescript@^5.0.0 --save-dev --no-audit; \
    fi && \
    echo "TypeScript location:" && \
    find node_modules -name "typescript" -type d 2>/dev/null | head -3 && \
    echo "TypeScript files:" && \
    ls -la node_modules/typescript/ 2>/dev/null | head -5 || echo "TypeScript directory not found"

# Copy source code and assets
COPY . .

# Build TypeScript - use npm run build (most reliable)
# npm scripts automatically add node_modules/.bin to PATH
RUN echo "=== Building TypeScript ===" && \
    npm run build && \
    echo "=== Build completed successfully ==="

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