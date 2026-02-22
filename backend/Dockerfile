FROM node:20.19-bullseye AS builder

WORKDIR /app
USER root

COPY package*.json ./
COPY tsconfig.json ./

# sqlite3 may require native compilation tools during install
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm config set registry https://registry.npmjs.org \
    && npm ci || npm install

COPY src ./src
COPY tests ./tests
COPY jest.config.js ./

ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run lint && npm run typecheck && npm test
RUN npm run build
RUN npm prune --omit=dev

FROM node:20.19-bullseye-slim

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER root
RUN mkdir -p /data && chown -R node:node /data /app

USER node
EXPOSE 3000
CMD ["npm", "start"]
