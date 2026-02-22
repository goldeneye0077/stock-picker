# Build stage
FROM node:20.19-bullseye AS builder

WORKDIR /app
USER root

# Copy configuration files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY eslint.config.js ./

ARG VITE_API_BASE_URL
ARG VITE_DATA_SERVICE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DATA_SERVICE_URL=${VITE_DATA_SERVICE_URL}

# Install dependencies
RUN npm config set registry https://registry.npmjs.org \
    && npm install --no-audit --no-fund --loglevel=info

# Copy source code
COPY public ./public
COPY src ./src

RUN npm run lint && npm run typecheck && CI=1 npm test

# Build the application
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Production stage
FROM nginx:1.27-alpine

# Copy built assets from builder to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
