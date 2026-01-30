import crypto from 'crypto';
import { BaseRepository } from './BaseRepository';
import { AppError, ErrorCode } from '../utils/errors';

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  is_admin: number;
  is_active: number;
  created_at: string;
};

export type AuthUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: string[];
};

const DEFAULT_USER_PAGES = [
  '/super-main-force',
  '/smart-selection',
  '/stocks',
  '/watchlist',
];

export class UserRepository extends BaseRepository {
  private isHexString(s: string): boolean {
    return /^[0-9a-f]+$/i.test(s);
  }

  private safeEqualString(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  private hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, s, 120000, 32, 'sha256')
      .toString('hex');
    return { hash, salt: s };
  }

  private verifyPassword(password: string, hash: string, salt: string): boolean {
    if (this.isHexString(hash) && this.isHexString(salt)) {
      const { hash: newHash } = this.hashPassword(password, salt);
      return this.safeEqualString(hash, newHash);
    } else {
      const saltBuf = Buffer.from(salt, 'base64');
      const iterations = [120000, 100000];
      for (const it of iterations) {
        const derived = crypto.pbkdf2Sync(password, saltBuf, it, 32, 'sha256').toString('base64');
        if (this.safeEqualString(hash, derived)) return true;
      }
      return false;
    }
  }

  private toAuthUser(row: UserRow, permissions: string[] = []): AuthUser {
    return {
      id: row.id,
      username: row.username,
      isAdmin: !!row.is_admin,
      isActive: !!row.is_active,
      permissions: permissions || []
    };
  }

  async findByUsername(username: string): Promise<UserRow | undefined> {
    const sql = `SELECT * FROM users WHERE username = ?`;
    return this.queryOne<UserRow>(sql, [username]);
  }

  async findById(id: number): Promise<UserRow | undefined> {
    const sql = `SELECT * FROM users WHERE id = ?`;
    return this.queryOne<UserRow>(sql, [id]);
  }

  async getPermissions(userId: number): Promise<string[]> {
    const sql = `SELECT path FROM user_permissions WHERE user_id = ? ORDER BY path`;
    const rows = await this.query<{ path: string }>(sql, [userId]);
    return rows.map(r => r.path);
  }

  async setPermissions(userId: number, paths: string[]): Promise<void> {
    await this.execute(`DELETE FROM user_permissions WHERE user_id = ?`, [userId]);
    for (const p of paths) {
      await this.execute(`INSERT OR IGNORE INTO user_permissions (user_id, path) VALUES (?, ?)`, [userId, p]);
    }
  }

  async getWatchlist(userId: number): Promise<string[]> {
    const rows = await this.query<{ stock_code: string }>(
      `SELECT stock_code FROM user_watchlists WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((r) => r.stock_code);
  }

  async addToWatchlist(userId: number, stockCode: string): Promise<void> {
    await this.execute(
      `INSERT OR IGNORE INTO user_watchlists (user_id, stock_code) VALUES (?, ?)`,
      [userId, stockCode]
    );
  }

  async removeFromWatchlist(userId: number, stockCode: string): Promise<void> {
    await this.execute(
      `DELETE FROM user_watchlists WHERE user_id = ? AND stock_code = ?`,
      [userId, stockCode]
    );
  }

  async createUser(username: string, password: string, isAdmin: boolean = false, isActive: boolean = true): Promise<AuthUser> {
    const exists = await this.findByUsername(username);
    if (exists) {
      throw new AppError('用户名已存在', 409, ErrorCode.CONFLICT);
    }
    const { hash, salt } = this.hashPassword(password);
    const sql = `
      INSERT INTO users (username, password_hash, password_salt, is_admin, is_active)
      VALUES (?, ?, ?, ?, ?)
    `;
    await this.execute(sql, [username, hash, salt, isAdmin ? 1 : 0, isActive ? 1 : 0]);
    const created = await this.findByUsername(username);
    if (!created) {
      throw new AppError('创建用户失败', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    if (!isAdmin) {
      await this.setPermissions(created.id, DEFAULT_USER_PAGES);
    }
    const perms = await this.getPermissions(created.id);
    const user = this.toAuthUser(created as UserRow, perms);
    return user;
  }

  async updateUser(id: number, payload: Partial<{ username: string; isAdmin: boolean; isActive: boolean }>): Promise<void> {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.username !== undefined) {
      fields.push('username = ?');
      params.push(payload.username);
    }
    if (payload.isAdmin !== undefined) {
      fields.push('is_admin = ?');
      params.push(payload.isAdmin ? 1 : 0);
    }
    if (payload.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(payload.isActive ? 1 : 0);
    }
    if (fields.length === 0) return;
    params.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    await this.execute(sql, params);
  }

  async listUsers(): Promise<(AuthUser & { createdAt?: string })[]> {
    const sql = `SELECT * FROM users ORDER BY id ASC`;
    const rows = await this.query<UserRow>(sql);
    const results: (AuthUser & { createdAt?: string })[] = [];
    for (const r of rows) {
      const perms = await this.getPermissions(r.id);
      const user = this.toAuthUser(r, perms);
      results.push({ ...user, createdAt: r.created_at });
    }
    return results;
  }

  async verifyLogin(username: string, password: string): Promise<AuthUser | null> {
    const row = await this.findByUsername(username);
    if (!row) return null;
    const ok = this.verifyPassword(password, row.password_hash, row.password_salt);
    if (!ok) return null;
    const perms = await this.getPermissions(row.id);
    return this.toAuthUser(row, perms);
  }

  async createSession(userId: number, ttlHours: number = 24 * 7): Promise<{ token: string; expiresAt: string }> {
    // AccessToken 缩短为 15 分钟 (仅作为示例，如果仍然依赖数据库验证，时长不宜太短以免频繁查库/刷新，
    // 但通常 AccessToken 短效 + RefreshToken 长效是标准。
    // 这里为了兼容现有逻辑不做大改，保持原逻辑，或者改为较短时间配合 RefreshToken 使用。)
    // 假设我们将 Session Token 视为 Short-lived Access Token (e.g. 1 hour)
    const ttl = 1; // 1 hour
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + ttl * 3600 * 1000);
    const sql = `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`;
    await this.execute(sql, [token, userId, expires.toISOString()]);
    return { token, expiresAt: expires.toISOString() };
  }

  async getSession(token: string): Promise<{ userId: number } | null> {
    const sql = `SELECT user_id, expires_at FROM sessions WHERE token = ?`;
    const row = await this.queryOne<{ user_id: number; expires_at: string }>(sql, [token]);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await this.execute(`DELETE FROM sessions WHERE token = ?`, [token]);
      return null;
    }
    return { userId: row.user_id };
  }

  async deleteSession(token: string): Promise<void> {
    await this.execute(`DELETE FROM sessions WHERE token = ?`, [token]);
  }

  // Refresh Token Methods
  async createRefreshToken(userId: number, ttlDays: number = 7): Promise<{ token: string; expiresAt: string }> {
    const token = crypto.randomBytes(40).toString('hex');
    const expires = new Date(Date.now() + ttlDays * 24 * 3600 * 1000);
    const sql = `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`;
    await this.execute(sql, [token, userId, expires.toISOString()]);
    return { token, expiresAt: expires.toISOString() };
  }

  async verifyRefreshToken(token: string): Promise<{ userId: number; expiresAt: string } | null> {
    const sql = `SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?`;
    const row = await this.queryOne<{ user_id: number; expires_at: string }>(sql, [token]);
    if (!row) return null;

    // Check expiration
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await this.execute(`DELETE FROM refresh_tokens WHERE token = ?`, [token]); // Clean up expired
      return null;
    }

    return { userId: row.user_id, expiresAt: row.expires_at };
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.execute(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
  }

  async deleteAllRefreshTokens(userId: number): Promise<void> {
    await this.execute(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
  }
}

