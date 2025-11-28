# Build stage
FROM node:20-slim AS builder

# Install system dependencies required for @napi-rs/canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and assets
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install runtime dependencies for @napi-rs/canvas
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (includes @napi-rs/canvas with bindings)
RUN npm ci --omit=dev

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