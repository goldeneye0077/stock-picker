#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { URL } = require('url');
const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
const MAX_REDIRECTS = 5;

const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error('Usage: node scripts/ops/verify_public_endpoints.js <public-base-url>');
  process.exit(1);
}

function getTransport(url) {
  if (url.protocol === 'https:') {
    return https;
  }
  if (url.protocol === 'http:') {
    return http;
  }
  throw new Error(`Unsupported protocol: ${url.protocol}`);
}

function requestBuffer(target, options = {}) {
  const url = new URL(target);
  const transport = getTransport(url);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        let totalLength = 0;

        res.on('data', (chunk) => {
          chunks.push(chunk);
          totalLength += chunk.length;
        });

        res.on('aborted', () => {
          reject(new Error(`Response aborted while reading ${target}`));
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks, totalLength),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(options.timeoutMs || 10000, () => {
      req.destroy(new Error(`Request timed out: ${target}`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function verifyWebSocketUpgrade(target) {
  const url = new URL(target);
  const transport = getTransport(url);

  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });

    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
      });
    });

    req.on('response', (res) => {
      const chunks = [];
      let totalLength = 0;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalLength += chunk.length;
      });

      res.on('end', () => {
        reject(
          new Error(
            `Expected websocket upgrade 101 from ${target}, got ${res.statusCode || 0}: ${Buffer.concat(chunks, totalLength).toString('utf8')}`
          )
        );
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`WebSocket probe timed out: ${target}`));
    });
    req.end();
  });
}

async function main() {
  let normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  for (let attempt = 0; attempt < MAX_REDIRECTS; attempt += 1) {
    console.log(`[verify] homepage ${normalizedBaseUrl}/`);
    const homepage = await requestBuffer(`${normalizedBaseUrl}/`);

    if (!REDIRECT_STATUSES.has(homepage.statusCode)) {
      if (homepage.statusCode !== 200) {
        throw new Error(`Expected homepage status 200, got ${homepage.statusCode}`);
      }
      break;
    }

    const locationHeader = homepage.headers.location;
    if (!locationHeader) {
      throw new Error(`Homepage returned redirect ${homepage.statusCode} without Location header`);
    }

    const redirectedUrl = new URL(locationHeader, `${normalizedBaseUrl}/`);
    const redirectedBaseUrl = `${redirectedUrl.protocol}//${redirectedUrl.host}`;
    console.log(`[verify] redirect ${homepage.statusCode}: ${normalizedBaseUrl} -> ${redirectedBaseUrl}`);
    normalizedBaseUrl = redirectedBaseUrl;

    if (attempt === MAX_REDIRECTS - 1) {
      throw new Error(`Too many redirects while resolving ${baseUrl}`);
    }
  }

  console.log(`[verify] static asset ${normalizedBaseUrl}/logo.png`);
  const logo = await requestBuffer(`${normalizedBaseUrl}/logo.png`);
  if (logo.statusCode !== 200) {
    throw new Error(`Expected /logo.png status 200, got ${logo.statusCode}`);
  }
  const contentLengthHeader = logo.headers['content-length'];
  if (contentLengthHeader) {
    const expectedLength = Number(contentLengthHeader);
    if (Number.isFinite(expectedLength) && expectedLength !== logo.body.length) {
      throw new Error(`logo.png size mismatch: downloaded=${logo.body.length} header=${expectedLength}`);
    }
  }

  console.log(`[verify] auth guard ${normalizedBaseUrl}/api/auth/me`);
  const auth = await requestBuffer(`${normalizedBaseUrl}/api/auth/me`);
  if (auth.statusCode !== 401) {
    throw new Error(`Expected /api/auth/me status 401, got ${auth.statusCode}`);
  }
  const authText = auth.body.toString('utf8');
  if (!authText.includes('"code":"UNAUTHORIZED"')) {
    throw new Error(`/api/auth/me did not return expected UNAUTHORIZED payload: ${authText}`);
  }

  console.log(`[verify] websocket upgrade ${normalizedBaseUrl}/ws`);
  const ws = await verifyWebSocketUpgrade(`${normalizedBaseUrl}/ws`);
  if (ws.statusCode !== 101) {
    throw new Error(`Expected websocket upgrade status 101, got ${ws.statusCode}`);
  }

  console.log(`[verify] public endpoint checks passed for ${normalizedBaseUrl}`);
}

main().catch((error) => {
  console.error(`[verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
