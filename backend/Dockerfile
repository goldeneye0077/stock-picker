FROM node:20.19-bullseye AS deps

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org \
    && (npm ci || npm install)

FROM node:20.19-bullseye AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js ./
COPY src ./src
COPY tests ./tests

ARG RUN_TESTS=true
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run lint \
    && npm run typecheck \
    && if [ "$RUN_TESTS" = "true" ]; then npm test; fi \
    && npm run build

FROM node:20.19-bullseye AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://registry.npmjs.org \
    && (npm ci --omit=dev || npm install --omit=dev) \
    && npm cache clean --force

FROM node:20.19-bullseye-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
