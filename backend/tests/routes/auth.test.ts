import request from 'supertest';

const userStore = new Map<number, { id: number; username: string; is_admin: number; is_active: number }>();
const permissionsStore = new Map<number, string[]>();
const sessionStore = new Map<string, { userId: number }>();
let userIdSeq = 1;
let tokenSeq = 1;
let verifyLoginImpl: ((username: string, password: string) => any) | null = null;

jest.mock('svg-captcha', () => {
  return {
    create: jest.fn(() => ({
      text: 'AbCd',
      data: '<svg>captcha</svg>',
    })),
  };
});

jest.mock('../../src/repositories', () => {
  return {
    UserRepository: jest.fn().mockImplementation(() => ({
      createUser: jest.fn(async (username: string, _password: string) => {
        const id = userIdSeq++;
        userStore.set(id, { id, username, is_admin: 0, is_active: 1 });
        permissionsStore.set(id, ['/super-main-force', '/smart-selection', '/stocks', '/watchlist']);
        return {
          id,
          username,
          isAdmin: false,
          isActive: true,
          permissions: permissionsStore.get(id) || []
        };
      }),
      verifyLogin: jest.fn(async (username: string, password: string) => {
        return verifyLoginImpl ? verifyLoginImpl(username, password) : null;
      }),
      createSession: jest.fn(async (userId: number) => {
        const token = `t${tokenSeq++}`;
        sessionStore.set(token, { userId });
        return { token, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
      }),
      createRefreshToken: jest.fn(async (userId: number) => {
        const token = `r${tokenSeq++}`;
        return { token, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString() };
      }),
      verifyRefreshToken: jest.fn(async (token: string) => {
        return { userId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
      }),
      deleteRefreshToken: jest.fn(async (token: string) => { }),
      deleteAllRefreshTokens: jest.fn(async (userId: number) => { }),
      getSession: jest.fn(async (token: string) => sessionStore.get(token) || null),
      deleteSession: jest.fn(async (token: string) => {
        sessionStore.delete(token);
      }),
      findById: jest.fn(async (userId: number) => userStore.get(userId)),
      getPermissions: jest.fn(async (userId: number) => permissionsStore.get(userId) || []),
      listUsers: jest.fn(async () => []),
      setPermissions: jest.fn(async (userId: number, paths: string[]) => {
        permissionsStore.set(userId, paths);
      }),
      updateUser: jest.fn(async () => { }),
      getWatchlist: jest.fn(async () => []),
      addToWatchlist: jest.fn(async () => { }),
      removeFromWatchlist: jest.fn(async () => { }),
    })),
  };
});

describe('Auth Routes', () => {
  beforeEach(() => {
    verifyLoginImpl = null;
  });

  it('注册后应获得默认权限并可获取 /me', async () => {
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
      expect.arrayContaining(['/super-main-force', '/smart-selection', '/stocks', '/watchlist'])
    );

    const token = registerRes.body.data.token as string;
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body?.success).toBe(true);
    expect(meRes.body?.data?.user?.username).toBe('user1');
    expect(meRes.body?.data?.user?.permissions).toEqual(
      expect.arrayContaining(['/super-main-force', '/smart-selection', '/stocks', '/watchlist'])
    );
  });

  it('验证码应支持大小写无关', async () => {
    verifyLoginImpl = (username: string, password: string) => {
      if (username === 'admin' && password === '111111') {
        return {
          id: 1,
          username: 'admin',
          isAdmin: true,
          isActive: true,
          permissions: ['/super-main-force', '/smart-selection', '/stocks', '/watchlist', '/settings', '/user-management'],
        };
      }
      return null;
    };

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

    const ip = '203.0.113.10';

    await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'bad' })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'bad' })
      .expect(401);

    const third = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'bad' })
      .expect(401);

    expect(third.body?.details?.requiresCaptcha).toBe(true);

    const ok = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: '111111', captcha: 'ABCD' })
      .expect(200);

    expect(ok.body?.success).toBe(true);
    expect(ok.body?.data?.token).toBeDefined();
    expect(ok.body?.data?.user?.username).toBe('admin');
  });
});
