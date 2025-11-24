# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy configuration files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./

# Install dependencies
RUN npm install

# Copy source code
COPY public ./public
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
