/**
 * Test app factory
 * Creates an Express app instance for testing without starting the server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import stockRoutes from '../../src/routes/stocks';
import analysisRoutes from '../../src/routes/analysis';
import { authRoutes, adminRoutes } from '../../src/routes/auth';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

export function createTestApp() {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use('/api/stocks', stockRoutes);
  app.use('/api/analysis', analysisRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
