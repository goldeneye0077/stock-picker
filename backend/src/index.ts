import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { initDatabase } from './config/database';
import stockRoutes from './routes/stocks';
import analysisRoutes from './routes/analysis';

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
  origin: '*', // 允许所有来源（远程调试用）
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/stocks', stockRoutes);
app.use('/api/analysis', analysisRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

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

    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Stock Picker API: http://0.0.0.0:${PORT}`);
      console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT}`);
      console.log(`🌐 Remote access enabled on all network interfaces`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();