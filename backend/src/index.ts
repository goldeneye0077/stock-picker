import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
// import swaggerUi from 'swagger-ui-express';
import { initDatabase } from './config/database';
// import { swaggerSpec } from './config/swagger';
import stockRoutes from './routes/stocks';
import analysisRoutes from './routes/analysis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004'
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Documentation - Temporarily disabled due to TypeScript configuration issues
// TODO: Re-enable after fixing ts-node type resolution in monorepo setup
// app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
//   customCss: '.swagger-ui .topbar { display: none }',
//   customSiteTitle: '智能选股系统 API 文档'
// }));

// API Spec JSON
// app.get('/api-docs.json', (req, res) => {
//   res.setHeader('Content-Type', 'application/json');
//   res.send(swaggerSpec);
// });

// Routes
app.use('/api/stocks', stockRoutes);
app.use('/api/analysis', analysisRoutes);

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
      // console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

