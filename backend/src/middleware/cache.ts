/**
 * Redis 缓存中间件
 * 用于自动处理 API 响应的缓存
 */

import { Request, Response, NextFunction } from 'express';
import { getCache, setCache } from '../config/redis';

/**
 * 缓存中间件选项
 */
interface CacheOptions {
  /**
   * 缓存键生成函数
   * 默认使用请求路径和查询参数
   */
  keyGenerator?: (req: Request) => string;

  /**
   * 缓存过期时间（秒）
   * 默认 300 秒（5分钟）
   */
  ttl?: number;

  /**
   * 是否启用缓存
   * 默认 true
   */
  enabled?: boolean;

  /**
   * 缓存条件函数
   * 返回 true 则使用缓存，false 则跳过缓存
   */
  condition?: (req: Request) => boolean;
}

/**
 * 默认缓存键生成器
 * 使用请求路径和查询参数生成唯一键
 */
function defaultKeyGenerator(req: Request): string {
  const { path, query } = req;
  const queryString = Object.keys(query)
    .sort()
    .map(key => `${key}=${query[key]}`)
    .join('&');

  return queryString ? `${path}?${queryString}` : path;
}

/**
 * 创建缓存中间件
 * @param options 缓存选项
 * @returns Express 中间件
 */
export function cache(options: CacheOptions = {}) {
  const {
    keyGenerator = defaultKeyGenerator,
    ttl = 300,
    enabled = true,
    condition = () => true
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // 如果缓存未启用，直接跳过
    if (!enabled) {
      return next();
    }

    // 只缓存 GET 请求
    if (req.method !== 'GET') {
      return next();
    }

    // 检查条件函数
    if (!condition(req)) {
      return next();
    }

    // 生成缓存键
    const cacheKey = keyGenerator(req);

    try {
      // 尝试从缓存中获取数据
      const cachedData = await getCache(cacheKey);

      if (cachedData !== null) {
        // 添加缓存命中标记
        res.setHeader('X-Cache', 'HIT');
        console.log(`Cache HIT: ${cacheKey}`);
        return res.json(cachedData);
      }

      // 缓存未命中
      res.setHeader('X-Cache', 'MISS');
      console.log(`Cache MISS: ${cacheKey}`);

      // 保存原始的 res.json 方法
      const originalJson = res.json.bind(res);

      // 重写 res.json 方法以拦截响应
      res.json = function(body: any) {
        // 只缓存成功的响应（success: true）
        if (body && body.success === true) {
          // 异步设置缓存，不阻塞响应
          setCache(cacheKey, body, ttl).catch(err => {
            console.error(`Error caching response for ${cacheKey}:`, err);
          });
        }

        // 调用原始的 json 方法发送响应
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      // 缓存错误不应该影响正常请求
      next();
    }
  };
}

/**
 * 按模式清除缓存的中间件
 * 用于 POST/PUT/DELETE 等修改数据的请求
 * @param patterns 要清除的缓存键模式数组
 */
export function clearCacheMiddleware(patterns: string | string[]) {
  const clearCache = async (req: Request, res: Response, next: NextFunction) => {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];

    // 保存原始的 res.json 方法
    const originalJson = res.json.bind(res);

    // 重写 res.json 方法
    res.json = function(body: any) {
      // 如果操作成功，清除相关缓存
      if (body && body.success === true) {
        // 异步清除缓存
        const { clearCacheByPattern } = require('../config/redis');
        Promise.all(
          patternsArray.map(pattern => clearCacheByPattern(pattern))
        ).catch(err => {
          console.error('Error clearing cache:', err);
        });
      }

      // 调用原始的 json 方法发送响应
      return originalJson(body);
    };

    next();
  };

  return clearCache;
}

/**
 * 缓存预热中间件
 * 在应用启动时预先加载常用数据到缓存
 */
export async function warmupCache(
  cacheKey: string,
  dataLoader: () => Promise<any>,
  ttl: number = 300
): Promise<void> {
  try {
    console.log(`Warming up cache for: ${cacheKey}`);
    const data = await dataLoader();
    await setCache(cacheKey, data, ttl);
    console.log(`Cache warmup completed for: ${cacheKey}`);
  } catch (error) {
    console.error(`Error warming up cache for ${cacheKey}:`, error);
  }
}
