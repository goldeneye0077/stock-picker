import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import swaggerUi from 'swagger-ui-express';
import { initDatabase } from './config/database';
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

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const enableSwagger = process.env.ENABLE_SWAGGER !== 'false';
const isProduction = process.env.NODE_ENV === 'production';

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

// Analytics logging middleware (must be after body parsing)
import { apiLoggerMiddleware } from './middleware/analyticsLogger';
app.use(apiLoggerMiddleware);

if (enableSwagger) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '智能选股系统 API 文档'
  }));

  app.get('/api-docs.json', (req, res) => {
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
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 处理 - 必须在所有路由之后
app.use(notFoundHandler);

// 全局错误处理中间件 - 必须在最后
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Stock Picker WebSocket'
  }));

  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Stock Picker API: http://localhost:${PORT}`);
      if (enableSwagger) {
        console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      }
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
