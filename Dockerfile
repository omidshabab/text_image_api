# Build stage
FROM node:20-slim AS builder

# Install system dependencies required for @napi-rs/canvas
# Using DEBIAN_FRONTEND=noninteractive to prevent interactive prompts
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        libharfbuzz-dev \
        libicu-dev \
        pkg-config && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --prefer-offline --no-audit

# Copy source code and assets
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install runtime dependencies for @napi-rs/canvas
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
        librsvg2-2 \
        libharfbuzz0b \
        libicu72 && \
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