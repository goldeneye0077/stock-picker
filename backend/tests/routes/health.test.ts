/**
 * Health check endpoint test
 * This test doesn't require database mocking
 */

import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

const app = createTestApp();

describe('Health Check', () => {
  it('应该返回健康状态', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('OK');
    expect(response.body.timestamp).toBeDefined();
  });
});
