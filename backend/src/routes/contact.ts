import crypto from 'crypto';
import express from 'express';
import { getDatabase } from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRepository } from '../repositories';
import { requireAdmin } from './auth';
import { AppError, ErrorCode } from '../utils/errors';
import { sendSuccess } from '../utils/responseHelper';

const router = express.Router();
const authRepo = new UserRepository();

const STATUS_VALUES = ['new', 'in_progress', 'resolved', 'archived'] as const;
type ContactMessageStatus = typeof STATUS_VALUES[number];

const CONTACT_RATE_WINDOW_MS = 10 * 60 * 1000;
const CONTACT_RATE_LIMIT = 5;
const contactSubmitHistory = new Map<string, number[]>();

function normalizeClientIp(req: express.Request): string {
  const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
  if (rawIp === '::1') return '127.0.0.1';
  if (rawIp.startsWith('::ffff:')) return rawIp.slice(7);
  return rawIp;
}

function hashClientIp(ip: string): string {
  const salt = process.env.CONTACT_IP_HASH_SALT || '';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function trimAndRequireString(value: unknown, min: number, max: number, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new AppError(`${fieldName} is required`, 400, ErrorCode.INVALID_PARAMETER);
  }
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AppError(
      `${fieldName} must be between ${min} and ${max} characters`,
      400,
      ErrorCode.INVALID_PARAMETER
    );
  }
  return text;
}

function trimOptionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function validateEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized) || normalized.length > 255) {
    throw new AppError('email is invalid', 400, ErrorCode.INVALID_PARAMETER);
  }
  return normalized;
}

function checkContactRateLimit(ip: string): void {
  const now = Date.now();
  const history = contactSubmitHistory.get(ip) || [];
  const validHistory = history.filter((ts) => now - ts <= CONTACT_RATE_WINDOW_MS);
  if (validHistory.length >= CONTACT_RATE_LIMIT) {
    contactSubmitHistory.set(ip, validHistory);
    throw new AppError(
      'Too many contact submissions. Please try again later.',
      429,
      ErrorCode.TOO_MANY_REQUESTS
    );
  }
  validHistory.push(now);
  contactSubmitHistory.set(ip, validHistory);
}

async function extractUserId(req: express.Request): Promise<number | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const session = await authRepo.getSession(token);
  return session?.userId || null;
}

function parseLimit(value: unknown, fallback: number = 20): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new AppError('limit must be an integer between 1 and 100', 400, ErrorCode.INVALID_PARAMETER);
  }
  return parsed;
}

function parseOffset(value: unknown, fallback: number = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
    throw new AppError('offset must be an integer between 0 and 100000', 400, ErrorCode.INVALID_PARAMETER);
  }
  return parsed;
}

function parseStatus(value: unknown): ContactMessageStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError('status is invalid', 400, ErrorCode.INVALID_PARAMETER);
  }
  if (!STATUS_VALUES.includes(value as ContactMessageStatus)) {
    throw new AppError(`status must be one of ${STATUS_VALUES.join(', ')}`, 400, ErrorCode.INVALID_PARAMETER);
  }
  return value as ContactMessageStatus;
}

router.post('/messages', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const clientIp = normalizeClientIp(req);
  checkContactRateLimit(clientIp);

  const userId = await extractUserId(req);
  const name = trimAndRequireString(req.body?.name, 1, 64, 'name');
  const email = validateEmail(trimAndRequireString(req.body?.email, 5, 255, 'email'));
  const subject = trimOptionalString(req.body?.subject, 120);
  const message = trimAndRequireString(req.body?.message, 5, 5000, 'message');
  const sourcePage = trimOptionalString(req.body?.source_page, 255);
  const userAgent = trimOptionalString(req.headers['user-agent'], 512);
  const ipHash = hashClientIp(clientIp);

  await db.run(
    `INSERT INTO contact_messages (user_id, name, email, subject, message, status, source_page, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
    [userId, name, email, subject, message, sourcePage, ipHash, userAgent]
  );

  const row = await db.get('SELECT last_insert_rowid() AS id');

  sendSuccess(res, {
    id: row?.id || null,
    status: 'new',
    submittedAt: new Date().toISOString(),
  }, 'Message submitted successfully');
}));

router.get('/admin/messages', asyncHandler(async (req, res) => {
  await requireAdmin(req);

  const db = getDatabase();
  const limit = parseLimit(req.query.limit, 20);
  const offset = parseOffset(req.query.offset, 0);
  const status = parseStatus(req.query.status);

  const whereSql = status ? 'WHERE status = ?' : '';
  const params: any[] = status ? [status] : [];

  const totalRow = await db.get(
    `SELECT COUNT(*) as total FROM contact_messages ${whereSql}`,
    params
  );

  const rows = await db.all(
    `SELECT id, user_id, name, email, subject, message, status, source_page, created_at, updated_at
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  sendSuccess(res, {
    items: rows,
    total: totalRow?.total || 0,
    limit,
    offset,
  });
}));

router.patch('/admin/messages/:id/status', asyncHandler(async (req, res) => {
  await requireAdmin(req);

  const db = getDatabase();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('id is invalid', 400, ErrorCode.INVALID_PARAMETER);
  }

  const status = parseStatus(req.body?.status);
  if (!status) {
    throw new AppError('status is required', 400, ErrorCode.INVALID_PARAMETER);
  }

  const row = await db.get('SELECT id FROM contact_messages WHERE id = ?', [id]);
  if (!row?.id) {
    throw new AppError('contact message not found', 404, ErrorCode.NOT_FOUND);
  }

  await db.run(
    `UPDATE contact_messages
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, id]
  );

  sendSuccess(res, { id, status }, 'Status updated');
}));

export default router;
