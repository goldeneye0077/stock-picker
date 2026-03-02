import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import swaggerUi from 'swagger-ui-express';
import { initDatabase } from './config/database';
import { initRedis, getRedisClient, closeRedis } from './config/redis';
import { checkTimescaleAvailability, closeTimescale } from './config/timescale';
import { swaggerSpec } from './config/swagger';
import stockRoutes from './routes/stocks';
import analysisRoutes from './routes/analysis';
import quotesRoutes from './routes/quotes';
import smartSelectionRoutes from './routes/smartSelection';
import analyticsRoutes from './routes/analytics';
import contactRoutes from './routes/contact';
import dashboardRoutes from './routes/dashboard';
import superMainForceRoutes from './routes/superMainForce';
import { authRoutes, adminRoutes } from './routes/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLoggerMiddleware } from './middleware/analyticsLogger';

dotenv.config();

type TrackedWebSocket = WebSocket & { isAlive?: boolean };
type LiveEvent = Record<string, unknown> & { type: string };

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const enableSwagger = process.env.ENABLE_SWAGGER !== 'false';
const isProduction = process.env.NODE_ENV === 'production';
const marketEventChannel = process.env.MARKET_EVENT_CHANNEL || 'market:events';

function parseCorsOrigins(value?: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseTrustProxy(value?: string): boolean | number | string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return value;
}

function safeParseJson(raw: string): LiveEvent {
  try {
    const payload = JSON.parse(raw);
    if (payload && typeof payload === 'object' && typeof payload.type === 'string') {
      return payload as LiveEvent;
    }
  } catch (_error) {
    // Ignore parse error and fallback to plain message wrapper.
  }
  return {
    type: 'market_event',
    payload: raw,
  };
}

function sendSocketMessage(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

function broadcast(wss: WebSocketServer, payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  });
}

function attachHeartbeat(wss: WebSocketServer): NodeJS.Timeout {
  return setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as TrackedWebSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}

// Middleware
app.disable('x-powered-by');
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.use(helmet());
const localhostOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const corsOrigins = new Set<string>([
  ...parseCorsOrigins(process.env.CORS_ALLOW_ORIGINS),
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
]);
const allowLocalhostCors = !isProduction || process.env.ALLOW_LOCALHOST_CORS === 'true';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.has(origin)) return callback(null, true);
    if (allowLocalhostCors && localhostOriginRegex.test(origin)) return callback(null, true);
    if (!isProduction && corsOrigins.size === 0) return callback(null, true);
    if (isProduction && corsOrigins.size === 0) {
      return callback(new Error('CORS_ALLOW_ORIGINS must be configured in production'));
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(apiLoggerMiddleware);

if (enableSwagger) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '智能选股系统 API 文档'
  }));

  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// Routes
app.use('/api/stocks', stockRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/smart-selection', smartSelectionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/home', dashboardRoutes);
app.use('/api/analysis/super-main-force', superMainForceRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = createServer(app);
const wss = new WebSocketServer({ server });

const heartbeatTimer = attachHeartbeat(wss);
let redisSubscriber: any = null;

wss.on('connection', (ws) => {
  const client = ws as TrackedWebSocket;
  client.isAlive = true;

  sendSocketMessage(client, {
    type: 'welcome',
    message: 'Connected to Stock Picker realtime bus',
    channels: [marketEventChannel],
    timestamp: new Date().toISOString(),
  });

  ws.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (message) => {
    const parsed = safeParseJson(message.toString());
    if (parsed.type === 'ping') {
      sendSocketMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
      return;
    }
    if (parsed.type === 'subscribe') {
      sendSocketMessage(ws, {
        type: 'subscribed',
        channels: [marketEventChannel],
        timestamp: new Date().toISOString(),
      });
      return;
    }
    sendSocketMessage(ws, {
      type: 'ack',
      eventType: parsed.type,
      timestamp: new Date().toISOString(),
    });
  });
});

async function startRedisRealtimeBridge(): Promise<void> {
  const redisClient = getRedisClient();
  if (!redisClient) {
    return;
  }

  redisSubscriber = redisClient.duplicate();
  await redisSubscriber.connect();
  await redisSubscriber.subscribe(marketEventChannel, (message: string) => {
    const event = safeParseJson(message);
    broadcast(wss, {
      ...event,
      channel: marketEventChannel,
      pushedAt: new Date().toISOString(),
    });
  });

  console.log(`[realtime] subscribed channel: ${marketEventChannel}`);
}

async function stopRedisRealtimeBridge(): Promise<void> {
  if (!redisSubscriber) {
    return;
  }
  try {
    await redisSubscriber.unsubscribe(marketEventChannel);
    await redisSubscriber.quit();
  } catch (error) {
    console.error('[realtime] failed to close redis subscriber:', error);
  } finally {
    redisSubscriber = null;
  }
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`[server] received ${signal}, shutting down...`);
  clearInterval(heartbeatTimer);
  wss.clients.forEach((client) => {
    try {
      client.close();
    } catch (_error) {
      // Ignore close failures.
    }
  });

  await stopRedisRealtimeBridge();
  await closeRedis();
  await closeTimescale();

  server.close((error?: Error) => {
    if (error) {
      console.error('[server] close failed:', error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDatabaseWithRetry(): Promise<void> {
  const maxAttempts = Math.max(1, Number(process.env.DB_INIT_MAX_ATTEMPTS || 30));
  const retryDelayMs = Math.max(1000, Number(process.env.DB_INIT_RETRY_DELAY_MS || 5000));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await initDatabase();
      return;
    } catch (error) {
      lastError = error;
      console.error(`[database] init attempt ${attempt}/${maxAttempts} failed:`, error);
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError;
}

async function startServer() {
  try {
    await initDatabaseWithRetry();
    console.log('Database initialized successfully');

    try {
      await initRedis();
    } catch (error) {
      console.warn('[redis] unavailable, cache/realtime degraded:', error);
    }

    try {
      const tsReady = await checkTimescaleAvailability();
      console.log(`[timescale] ${tsReady ? 'ready' : 'disabled/unavailable'}`);
    } catch (error) {
      console.warn('[timescale] check failed:', error);
    }

    try {
      await startRedisRealtimeBridge();
    } catch (error) {
      console.warn('[realtime] redis bridge disabled:', error);
    }

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Stock Picker API: http://localhost:${PORT}`);
      if (enableSwagger) {
        console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
      }
      console.log(`WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
