# Build stage

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy configuration files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm install \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY src ./src

# Build the application
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Production stage
FROM node:20-bookworm-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm install --omit=dev \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]