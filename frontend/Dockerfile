FROM node:20.19-bullseye AS deps

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org \
    && (npm ci || npm install --no-audit --no-fund --loglevel=info)

FROM node:20.19-bullseye AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY eslint.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_API_BASE_URL
ARG VITE_DATA_SERVICE_URL
ARG RUN_TESTS=false
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DATA_SERVICE_URL=${VITE_DATA_SERVICE_URL}
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run lint \
    && npm run typecheck \
    && if [ "$RUN_TESTS" = "true" ]; then CI=1 npm test; fi \
    && npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
