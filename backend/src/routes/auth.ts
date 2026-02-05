import express from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';
import { AppError, ErrorCode } from '../utils/errors';
import { UserRepository } from '../repositories';
import svgCaptcha from 'svg-captcha';

const authRepo = new UserRepository();

// 登录失败计数器 (IP -> { count, lastAttempt, captcha? })
const loginAttempts = new Map<string, { count: number; lastAttempt: number; captcha?: string; captchaExpires?: number }>();

// 清理过期的登录尝试记录 (30分钟后自动清理)
const ATTEMPT_TTL = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function generateCaptcha(): string {
  // 生成6位数字验证码
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanupExpiredAttempts() {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (now - data.lastAttempt > ATTEMPT_TTL) {
      loginAttempts.delete(ip);
    }
  }
}

// 每5分钟清理一次
setInterval(cleanupExpiredAttempts, 5 * 60 * 1000);

function getToken(req: express.Request): string | null {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return null;
}

async function requireUser(req: express.Request): Promise<{ userId: number }> {
  const token = getToken(req);
  if (!token) {
    throw new AppError('缺少认证信息', 401, ErrorCode.UNAUTHORIZED);
  }
  const session = await authRepo.getSession(token);
  if (!session) {
    throw new AppError('认证无效或已过期', 401, ErrorCode.UNAUTHORIZED);
  }
  return { userId: session.userId };
}

async function requireAdmin(req: express.Request): Promise<number> {
  const { userId } = await requireUser(req);
  const row = await authRepo.findById(userId);
  if (!row || !row.is_admin) {
    throw new AppError('需要管理员权限', 403, ErrorCode.FORBIDDEN);
  }
  return userId;
}

export const authRoutes = express.Router();

authRoutes.post('/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    throw new AppError('用户名和密码必填', 400, ErrorCode.INVALID_PARAMETER);
  }
  if (password.length < 6) {
    throw new AppError('密码至少需要6位字符', 400, ErrorCode.INVALID_PARAMETER);
  }
  const user = await authRepo.createUser(username, password, false, true);
  const session = await authRepo.createSession(user.id);
  const refreshToken = await authRepo.createRefreshToken(user.id);

  sendSuccess(res, {
    token: session.token,
    refreshToken: refreshToken.token,
    expiresAt: session.expiresAt,
    user
  });
}));

// 获取验证码
authRoutes.get('/captcha', asyncHandler(async (req, res) => {
  const ip = getClientIp(req);

  const captchaObj = svgCaptcha.create({
    size: 4,
    noise: 2,
    color: true,
    background: '#12183a'
  });

  const now = Date.now();
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: now };

  attempts.captcha = captchaObj.text.toLowerCase();
  attempts.captchaExpires = now + 5 * 60 * 1000; // 5分钟有效
  attempts.lastAttempt = now;
  loginAttempts.set(ip, attempts);

  sendSuccess(res, {
    captcha: captchaObj.data, // 这是 SVG 字符串
    message: '验证码已生成',
    expiresIn: 300 // 秒
  });
}));

authRoutes.post('/login', asyncHandler(async (req, res) => {
  const { username, password, captcha } = req.body || {};
  const ip = getClientIp(req);
  const now = Date.now();

  // 获取或初始化该IP的登录尝试记录
  let attempts = loginAttempts.get(ip);
  if (!attempts || now - attempts.lastAttempt > ATTEMPT_TTL) {
    attempts = { count: 0, lastAttempt: now };
  }

  // 检查是否需要验证码
  const requiresCaptcha = attempts.count >= MAX_ATTEMPTS;

  if (!username || !password) {
    throw new AppError('用户名和密码必填', 400, ErrorCode.INVALID_PARAMETER);
  }

  // 如果需要验证码但没提供或验证码错误
  if (requiresCaptcha) {
    if (!captcha) {
      attempts.lastAttempt = now;
      loginAttempts.set(ip, attempts);
      // 生成新验证码
      const captchaObj = svgCaptcha.create({ size: 4, noise: 2 });
      attempts.captcha = captchaObj.text.toLowerCase();
      attempts.captchaExpires = now + 5 * 60 * 1000;
      loginAttempts.set(ip, attempts);

      throw new AppError('登录失败次数过多，请输入验证码', 429, ErrorCode.TOO_MANY_REQUESTS, {
        requiresCaptcha: true,
        captcha: captchaObj.data,
        remainingAttempts: 0
      });
    }

    // 验证码检查
    if (!attempts.captcha || !attempts.captchaExpires || now > attempts.captchaExpires) {
      const captchaObj = svgCaptcha.create({ size: 4, noise: 2 });
      attempts.captcha = captchaObj.text.toLowerCase();
      attempts.captchaExpires = now + 5 * 60 * 1000;
      attempts.lastAttempt = now;
      loginAttempts.set(ip, attempts);

      throw new AppError('验证码已过期，请使用新验证码', 400, ErrorCode.INVALID_PARAMETER, {
        requiresCaptcha: true,
        captcha: captchaObj.data,
        remainingAttempts: 0
      });
    }

    const normalizedCaptcha = typeof captcha === 'string' ? captcha.trim().toLowerCase() : '';
    if (normalizedCaptcha !== attempts.captcha) {
      attempts.lastAttempt = now;
      loginAttempts.set(ip, attempts);

      throw new AppError('验证码错误', 400, ErrorCode.INVALID_PARAMETER, {
        requiresCaptcha: true,
        remainingAttempts: 0
      });
    }
  }

  const user = await authRepo.verifyLogin(username, password);
  if (!user) {
    // 登录失败，增加计数
    attempts.count += 1;
    attempts.lastAttempt = now;

    const remaining = Math.max(0, MAX_ATTEMPTS - attempts.count);

    // 如果达到阈值，生成验证码
    if (attempts.count >= MAX_ATTEMPTS) {
      const captchaObj = svgCaptcha.create({ size: 4, noise: 2 });
      attempts.captcha = captchaObj.text.toLowerCase();
      attempts.captchaExpires = now + 5 * 60 * 1000;
      loginAttempts.set(ip, attempts);

      throw new AppError('用户名或密码错误，登录失败次数过多，请输入验证码', 401, ErrorCode.UNAUTHORIZED, {
        requiresCaptcha: true,
        captcha: captchaObj.data,
        remainingAttempts: 0
      });
    }

    loginAttempts.set(ip, attempts);
    throw new AppError(`用户名或密码错误，还剩 ${remaining} 次尝试机会`, 401, ErrorCode.UNAUTHORIZED, {
      requiresCaptcha: false,
      remainingAttempts: remaining
    });
  }

  if (!user.isActive) {
    throw new AppError('账户未启用，请联系管理员', 403, ErrorCode.FORBIDDEN);
  }

  // 登录成功，清除该IP的失败记录
  loginAttempts.delete(ip);

  const session = await authRepo.createSession(user.id);
  const refreshToken = await authRepo.createRefreshToken(user.id);

  sendSuccess(res, {
    token: session.token,
    refreshToken: refreshToken.token,
    expiresAt: session.expiresAt,
    user
  });
}));

authRoutes.post('/refresh-token', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new AppError('Refresh Token 必填', 400, ErrorCode.INVALID_PARAMETER);
  }

  const tokenData = await authRepo.verifyRefreshToken(refreshToken);
  if (!tokenData) {
    throw new AppError('Refresh Token 无效或已过期', 401, ErrorCode.UNAUTHORIZED);
  }

  // Token Rotation: Invalidate old refresh token and issue a new one
  await authRepo.deleteRefreshToken(refreshToken);

  const userRow = await authRepo.findById(tokenData.userId);
  if (!userRow || !userRow.is_active) {
    throw new AppError('用户不存在或已禁用', 401, ErrorCode.UNAUTHORIZED);
  }

  // Issue new tokens
  const newSession = await authRepo.createSession(tokenData.userId);
  const newRefreshToken = await authRepo.createRefreshToken(tokenData.userId);

  sendSuccess(res, {
    token: newSession.token,
    expiresAt: newSession.expiresAt,
    refreshToken: newRefreshToken.token
  });
}));

authRoutes.post('/logout', asyncHandler(async (req, res) => {
  const token = getToken(req);
  const { refreshToken } = req.body;

  if (token) {
    await authRepo.deleteSession(token);
  }
  if (refreshToken) {
    await authRepo.deleteRefreshToken(refreshToken);
  }

  sendSuccess(res, { success: true });
}));

authRoutes.get('/me', asyncHandler(async (req, res) => {
  const { userId } = await requireUser(req);
  const row = await authRepo.findById(userId);
  if (!row) {
    throw new AppError('用户不存在', 404, ErrorCode.NOT_FOUND);
  }
  const perms = await authRepo.getPermissions(userId);
  const user = {
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    isActive: !!row.is_active,
    permissions: perms
  };
  sendSuccess(res, { user });
}));

authRoutes.get('/watchlist', asyncHandler(async (req, res) => {
  const { userId } = await requireUser(req);
  const codes = await authRepo.getWatchlist(userId);
  sendSuccess(res, { codes });
}));

authRoutes.post('/watchlist', asyncHandler(async (req, res) => {
  const { userId } = await requireUser(req);
  const stockCode = typeof req.body?.stockCode === 'string' ? req.body.stockCode.trim() : '';
  if (!stockCode) {
    throw new AppError('stockCode 必填', 400, ErrorCode.INVALID_PARAMETER);
  }
  await authRepo.addToWatchlist(userId, stockCode);
  sendSuccess(res, { success: true });
}));

authRoutes.delete('/watchlist/:stockCode', asyncHandler(async (req, res) => {
  const { userId } = await requireUser(req);
  const stockCode = typeof req.params.stockCode === 'string' ? req.params.stockCode.trim() : '';
  if (!stockCode) {
    throw new AppError('stockCode 必填', 400, ErrorCode.INVALID_PARAMETER);
  }
  await authRepo.removeFromWatchlist(userId, stockCode);
  sendSuccess(res, { success: true });
}));

export const adminRoutes = express.Router();

adminRoutes.get('/users', asyncHandler(async (req, res) => {
  await requireAdmin(req);
  const users = await authRepo.listUsers();
  sendSuccess(res, { users });
}));

adminRoutes.get('/pages', asyncHandler(async (req, res) => {
  await requireAdmin(req);
  const pages = [
    '/super-main-force',
    '/smart-selection',
    '/stocks',
    '/watchlist',
    '/settings',
    '/user-management'
  ];
  sendSuccess(res, { pages });
}));

adminRoutes.put('/users/:userId', asyncHandler(async (req, res) => {
  await requireAdmin(req);
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    throw new AppError('无效的用户ID', 400, ErrorCode.INVALID_PARAMETER);
  }
  const payload: Partial<{ username: string; isAdmin: boolean; isActive: boolean }> = {};
  if (typeof req.body?.username === 'string') payload.username = req.body.username;
  if (typeof req.body?.isAdmin === 'boolean') payload.isAdmin = req.body.isAdmin;
  if (typeof req.body?.isActive === 'boolean') payload.isActive = req.body.isActive;
  await authRepo.updateUser(userId, payload);
  sendSuccess(res, { success: true });
}));

adminRoutes.put('/users/:userId/permissions', asyncHandler(async (req, res) => {
  await requireAdmin(req);
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    throw new AppError('无效的用户ID', 400, ErrorCode.INVALID_PARAMETER);
  }
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter((p: any) => typeof p === 'string') : [];
  await authRepo.setPermissions(userId, paths);
  sendSuccess(res, { success: true, permissions: paths });
}));

adminRoutes.post('/users', asyncHandler(async (req, res) => {
  await requireAdmin(req);
  const { username, password, isAdmin, isActive } = req.body || {};
  if (!username || !password) {
    throw new AppError('用户名和初始密码必填', 400, ErrorCode.INVALID_PARAMETER);
  }
  const user = await authRepo.createUser(username, password, !!isAdmin, isActive !== false);
  sendSuccess(res, { user });
}));
