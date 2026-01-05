# Build stage
FROM alibaba-cloud-linux-3-registry.cn-hangzhou.cr.aliyuncs.com/alinux3/node:20.16 AS builder

WORKDIR /app

# Copy configuration files
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./

ARG VITE_API_BASE_URL
ARG VITE_DATA_SERVICE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DATA_SERVICE_URL=${VITE_DATA_SERVICE_URL}

# Install dependencies
RUN npm config set registry https://registry.npmmirror.com && npm install

# Copy source code
COPY public ./public
COPY src ./src

# Build the application
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Production stage
FROM registry.openanolis.cn/openanolis/nginx:1.14.1-8.6

# Copy built assets from builder to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
