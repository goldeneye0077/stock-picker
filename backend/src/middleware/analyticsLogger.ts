import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../config/database';

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice(7).trim();
    return token || null;
}

function getClientIp(req: Request): string | null {
    const rawIp = req.ip || req.socket?.remoteAddress || null;
    if (!rawIp) return null;
    if (rawIp === '::1') return '127.0.0.1';
    if (rawIp.startsWith('::ffff:')) return rawIp.slice(7);
    return rawIp;
}

// API call logging middleware
export function apiLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/health' || req.path.startsWith('/api-docs')) {
        return next();
    }

    const startTime = Date.now();
    const originalEnd = res.end;
    const endpoint = req.path;
    const method = req.method;
    const bearerToken = getBearerToken(req);
    const ipAddress = getClientIp(req);

    res.end = function (this: Response, ...args: Parameters<typeof originalEnd>) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;

        setImmediate(async () => {
            try {
                const db = getDatabase();
                let userId: number | null = null;

                if (bearerToken) {
                    const tokenHash = hashToken(bearerToken);
                    const sessionRow = await db.get(
                        `SELECT user_id FROM sessions WHERE token = ? OR token = ? LIMIT 1`,
                        [tokenHash, bearerToken]
                    );
                    userId = sessionRow?.user_id ?? null;
                }

                await db.run(
                    `INSERT INTO api_logs (endpoint, method, status_code, response_time_ms, user_id, ip_address)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [endpoint, method, statusCode, responseTime, userId, ipAddress]
                );
            } catch (err) {
                console.error('Failed to log API call:', err);
            }
        });

        return originalEnd.apply(this, args);
    } as typeof originalEnd;

    next();
}

export interface PageViewData {
    page_path: string;
    user_id?: number | null;
    ip_address?: string | null;
    user_agent?: string | null;
}

export async function recordPageView(data: PageViewData): Promise<void> {
    const db = getDatabase();
    await db.run(
        `INSERT INTO page_views (page_path, user_id, ip_address, user_agent)
         VALUES (?, ?, ?, ?)`,
        [data.page_path, data.user_id || null, data.ip_address || null, data.user_agent || null]
    );
}
