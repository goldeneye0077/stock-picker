import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';
import { AppError, ErrorCode } from '../utils/errors';
import { UserRepository } from '../repositories';

const authRepo = new UserRepository();

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
  const user = await authRepo.createUser(username, password, false, true);
  const session = await authRepo.createSession(user.id);
  sendSuccess(res, {
    token: session.token,
    expiresAt: session.expiresAt,
    user
  });
}));

authRoutes.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    throw new AppError('用户名和密码必填', 400, ErrorCode.INVALID_PARAMETER);
  }
  const user = await authRepo.verifyLogin(username, password);
  if (!user) {
    throw new AppError('用户名或密码错误', 401, ErrorCode.UNAUTHORIZED);
  }
  if (!user.isActive) {
    throw new AppError('账户未启用', 403, ErrorCode.FORBIDDEN);
  }
  const session = await authRepo.createSession(user.id);
  sendSuccess(res, {
    token: session.token,
    expiresAt: session.expiresAt,
    user
  });
}));

authRoutes.post('/logout', asyncHandler(async (req, res) => {
  const token = getToken(req);
  if (token) {
    await authRepo.deleteSession(token);
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
