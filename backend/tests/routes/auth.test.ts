import request from 'supertest';

describe('Auth Routes', () => {
  it('注册后应获得默认权限并可获取 /me', async () => {
    process.env.DATABASE_URL = 'sqlite::memory:';
    jest.resetModules();

    const { initDatabase } = await import('../../src/config/database');
    await initDatabase();

    const express = (await import('express')).default;
    const helmet = (await import('helmet')).default;
    const cors = (await import('cors')).default;
    const { authRoutes } = await import('../../src/routes/auth');
    const { errorHandler, notFoundHandler } = await import('../../src/middleware/errorHandler');

    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'user1', password: 'pass1234' })
      .expect(200);

    expect(registerRes.body?.success).toBe(true);
    expect(registerRes.body?.data?.token).toBeDefined();
    expect(registerRes.body?.data?.user?.username).toBe('user1');
    expect(registerRes.body?.data?.user?.isAdmin).toBe(false);
    expect(registerRes.body?.data?.user?.permissions).toEqual(
      expect.arrayContaining(['/super-main-force', '/smart-selection', '/stocks'])
    );

    const token = registerRes.body.data.token as string;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body?.success).toBe(true);
    expect(meRes.body?.data?.user?.username).toBe('user1');
    expect(meRes.body?.data?.user?.permissions).toEqual(
      expect.arrayContaining(['/super-main-force', '/smart-selection', '/stocks'])
    );
  });
});

