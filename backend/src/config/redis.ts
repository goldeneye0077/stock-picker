/**
 * Redis 配置文件
 * 提供 Redis 连接和缓存工具函数
 */

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

/**
 * 初始化 Redis 连接
 */
export async function initRedis(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        // 最多重试 10 次
        if (retries > 10) {
          console.error('Redis connection failed after 10 retries');
          return new Error('Redis connection failed');
        }
        // 重试间隔：1秒、2秒、4秒...最多10秒
        return Math.min(retries * 1000, 10000);
      }
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis Client Connected');
  });

  redisClient.on('ready', () => {
    console.log('Redis Client Ready');
  });

  redisClient.on('reconnecting', () => {
    console.log('Redis Client Reconnecting...');
  });

  try {
    await redisClient.connect();
    console.log('✅ Redis initialized successfully');
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    redisClient = null;
    throw error;
  }
}

/**
 * 获取 Redis 客户端实例
 */
export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

/**
 * 关闭 Redis 连接
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

/**
 * 缓存键前缀
 */
export const CACHE_KEYS = {
  STOCK_LIST: 'stock:list',
  STOCK_DETAIL: 'stock:detail',
  STOCK_HISTORY: 'stock:history',
  ANALYSIS_FUND_FLOW: 'analysis:fund_flow',
  ANALYSIS_VOLUME: 'analysis:volume',
  ANALYSIS_MAIN_FORCE: 'analysis:main_force',
  BUY_SIGNALS: 'signals:buy'
} as const;

/**
 * 缓存过期时间（秒）
 */
export const CACHE_TTL = {
  SHORT: 60,          // 1分钟 - 实时数据
  MEDIUM: 300,        // 5分钟 - 准实时数据
  LONG: 1800,         // 30分钟 - 分析数据
  VERY_LONG: 3600     // 1小时 - 历史数据
} as const;

/**
 * 获取缓存
 * @param key 缓存键
 * @returns 缓存的值或 null
 */
export async function getCache<T = any>(key: string): Promise<T | null> {
  if (!redisClient) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Error getting cache for key ${key}:`, error);
    return null;
  }
}

/**
 * 设置缓存
 * @param key 缓存键
 * @param value 缓存值
 * @param ttl 过期时间（秒），默认 5 分钟
 */
export async function setCache<T = any>(
  key: string,
  value: T,
  ttl: number = CACHE_TTL.MEDIUM
): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    await redisClient.setEx(key, ttl, serialized);
  } catch (error) {
    console.error(`Error setting cache for key ${key}:`, error);
  }
}

/**
 * 删除缓存
 * @param key 缓存键或键数组
 */
export async function deleteCache(key: string | string[]): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    if (Array.isArray(key)) {
      if (key.length > 0) {
        await redisClient.del(key);
      }
    } else {
      await redisClient.del(key);
    }
  } catch (error) {
    console.error(`Error deleting cache for key ${key}:`, error);
  }
}

/**
 * 清除匹配的缓存键
 * @param pattern 匹配模式（如 'stock:*'）
 */
export async function clearCacheByPattern(pattern: string): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error(`Error clearing cache by pattern ${pattern}:`, error);
  }
}

/**
 * 检查缓存是否存在
 * @param key 缓存键
 * @returns 是否存在
 */
export async function cacheExists(key: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    console.error(`Error checking cache existence for key ${key}:`, error);
    return false;
  }
}

/**
 * 获取缓存剩余过期时间
 * @param key 缓存键
 * @returns 剩余秒数，-1 表示永不过期，-2 表示键不存在
 */
export async function getCacheTTL(key: string): Promise<number> {
  if (!redisClient) {
    return -2;
  }

  try {
    return await redisClient.ttl(key);
  } catch (error) {
    console.error(`Error getting cache TTL for key ${key}:`, error);
    return -2;
  }
}
