import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../config/database';

// 获取客户端 IP
function getClientIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0].split(',')[0].trim();
    }
    return req.socket?.remoteAddress || null;
}

// 从 JWT token 中提取 user_id
function extractUserIdFromToken(req: Request): number | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    try {
        const token = authHeader.slice(7);
        // 简单解码 JWT payload (不验证签名，因为这只是日志记录)
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.userId || payload.user_id || null;
    } catch {
        return null;
    }
}

// API 调用日志中间件
export function apiLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    // 跳过健康检查和静态资源
    if (req.path === '/health' || req.path.startsWith('/api-docs')) {
        return next();
    }

    const startTime = Date.now();
    const originalEnd = res.end;
    const endpoint = req.path;
    const method = req.method;
    const userId = extractUserIdFromToken(req);
    const ipAddress = getClientIp(req);

    // 重写 res.end 来捕获响应完成
    res.end = function (this: Response, ...args: Parameters<typeof originalEnd>) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;

        // 异步记录，不阻塞响应
        setImmediate(async () => {
            try {
                const db = getDatabase();
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

// 页面访问记录接口类型
export interface PageViewData {
    page_path: string;
    user_id?: number | null;
    ip_address?: string | null;
    user_agent?: string | null;
}

// 记录页面访问（供前端调用）
export async function recordPageView(data: PageViewData): Promise<void> {
    const db = getDatabase();
    await db.run(
        `INSERT INTO page_views (page_path, user_id, ip_address, user_agent)
     VALUES (?, ?, ?, ?)`,
        [data.page_path, data.user_id || null, data.ip_address || null, data.user_agent || null]
    );
}
