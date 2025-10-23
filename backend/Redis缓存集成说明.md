# Redis 缓存集成说明

## 概述

已为智能选股系统后端集成 Redis 缓存功能，用于提升 API 响应速度和减轻数据库压力。

## 文件结构

```
backend/src/
├── config/
│   └── redis.ts              # Redis 连接配置和缓存工具函数
├── middleware/
│   └── cache.ts              # 缓存中间件
└── index.ts                  # 应用入口（需要集成 Redis 初始化）
```

## Redis 配置 (`config/redis.ts`)

### 核心功能

1. **Redis 连接管理**
   - `initRedis()` - 初始化 Redis 连接
   - `getRedisClient()` - 获取 Redis 客户端实例
   - `closeRedis()` - 关闭 Redis 连接

2. **缓存操作函数**
   - `getCache<T>(key)` - 获取缓存
   - `setCache<T>(key, value, ttl)` - 设置缓存
   - `deleteCache(key)` - 删除缓存
   - `clearCacheByPattern(pattern)` - 按模式清除缓存
   - `cacheExists(key)` - 检查缓存是否存在
   - `getCacheTTL(key)` - 获取缓存剩余过期时间

3. **预定义常量**
   - `CACHE_KEYS` - 缓存键前缀
   - `CACHE_TTL` - 缓存过期时间

### 缓存键定义

```typescript
export const CACHE_KEYS = {
  STOCK_LIST: 'stock:list',
  STOCK_DETAIL: 'stock:detail',
  STOCK_HISTORY: 'stock:history',
  ANALYSIS_FUND_FLOW: 'analysis:fund_flow',
  ANALYSIS_VOLUME: 'analysis:volume',
  ANALYSIS_MAIN_FORCE: 'analysis:main_force',
  BUY_SIGNALS: 'signals:buy'
} as const;
```

### 缓存过期时间

```typescript
export const CACHE_TTL = {
  SHORT: 60,          // 1分钟 - 实时数据
  MEDIUM: 300,        // 5分钟 - 准实时数据
  LONG: 1800,         // 30分钟 - 分析数据
  VERY_LONG: 3600     // 1小时 - 历史数据
} as const;
```

## 缓存中间件 (`middleware/cache.ts`)

### 中间件函数

1. **`cache(options)`** - 自动缓存 GET 请求响应
   ```typescript
   import { cache } from '../middleware/cache';
   import { CACHE_TTL } from '../config/redis';

   router.get('/stocks', cache({ ttl: CACHE_TTL.SHORT }), getStocks);
   ```

2. **`clearCacheMiddleware(patterns)`** - 清除相关缓存
   ```typescript
   import { clearCacheMiddleware } from '../middleware/cache';

   router.post('/stocks',
     clearCacheMiddleware(['stock:*', 'analysis:*']),
     createStock
   );
   ```

3. **`warmupCache(key, dataLoader, ttl)`** - 缓存预热
   ```typescript
   import { warmupCache } from '../middleware/cache';

   await warmupCache('stock:list', async () => {
     return await fetchAllStocks();
   }, CACHE_TTL.MEDIUM);
   ```

### 中间件选项

```typescript
interface CacheOptions {
  keyGenerator?: (req: Request) => string;  // 自定义缓存键生成
  ttl?: number;                             // 过期时间（秒）
  enabled?: boolean;                        // 是否启用
  condition?: (req: Request) => boolean;    // 缓存条件判断
}
```

## 集成步骤

### 1. 安装 Redis 客户端

```bash
cd backend
npm install redis
```

### 2. 配置环境变量

在 `backend/.env` 文件中添加：

```env
REDIS_URL=redis://localhost:6379
```

在 Docker 环境中：

```env
REDIS_URL=redis://redis:6379
```

### 3. 初始化 Redis（在 `index.ts` 中）

```typescript
import { initRedis, closeRedis } from './config/redis';

async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    console.log('Database initialized successfully');

    // 初始化 Redis（可选，允许启动失败）
    try {
      await initRedis();
    } catch (error) {
      console.warn('Redis initialization failed, continuing without cache');
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await closeRedis();
  process.exit(0);
});
```

### 4. 在路由中使用缓存

**示例：股票列表路由**

```typescript
import { Router } from 'express';
import { cache, clearCacheMiddleware } from '../middleware/cache';
import { CACHE_TTL } from '../config/redis';

const router = Router();

// GET 请求自动缓存 1分钟
router.get('/stocks',
  cache({ ttl: CACHE_TTL.SHORT }),
  async (req, res) => {
    const stocks = await stockRepository.findAll();
    res.json({ success: true, data: stocks });
  }
);

// POST 请求清除相关缓存
router.post('/stocks',
  clearCacheMiddleware('stock:*'),
  async (req, res) => {
    const newStock = await stockRepository.create(req.body);
    res.json({ success: true, data: newStock });
  }
);

export default router;
```

**示例：分析路由**

```typescript
// 资金流向分析 - 缓存 5分钟
router.get('/analysis/fund-flow',
  cache({
    ttl: CACHE_TTL.MEDIUM,
    keyGenerator: (req) => `analysis:fund_flow:${req.query.days || 7}`
  }),
  getFundFlowAnalysis
);

// 成交量分析 - 缓存 30分钟
router.get('/analysis/volume',
  cache({ ttl: CACHE_TTL.LONG }),
  getVolumeAnalysis
);
```

### 5. 手动使用缓存函数

```typescript
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '../config/redis';

async function getStockDetail(stockCode: string) {
  // 尝试从缓存获取
  const cacheKey = `${CACHE_KEYS.STOCK_DETAIL}:${stockCode}`;
  const cached = await getCache(cacheKey);

  if (cached) {
    return cached;
  }

  // 从数据库获取
  const detail = await stockRepository.findByCode(stockCode);

  // 设置缓存
  await setCache(cacheKey, detail, CACHE_TTL.MEDIUM);

  return detail;
}
```

## 缓存策略建议

### 1. 实时数据（1分钟缓存）
- 股票列表
- 最新价格
- 实时行情

### 2. 准实时数据（5分钟缓存）
- 股票详情
- 分析指标
- 买入信号

### 3. 分析数据（30分钟缓存）
- 资金流向分析
- 成交量分析
- 主力行为分析

### 4. 历史数据（1小时缓存）
- 历史K线数据
- 历史分析结果
- 统计数据

## 缓存失效策略

### 自动失效
- 使用 TTL 自动过期

### 手动失效
- POST/PUT/DELETE 操作后清除相关缓存
- 使用 `clearCacheByPattern()` 批量清除

```typescript
import { clearCacheByPattern } from '../config/redis';

// 清除所有股票相关缓存
await clearCacheByPattern('stock:*');

// 清除所有分析缓存
await clearCacheByPattern('analysis:*');
```

## 监控和调试

### 缓存命中率
- 响应头包含 `X-Cache: HIT` 或 `X-Cache: MISS`
- 控制台日志显示缓存命中/未命中信息

### Redis 连接状态
- 启动时显示 Redis 连接状态
- 自动重连机制（最多10次，间隔递增）

## Docker 部署

在 `docker-compose.yml` 中已包含 Redis 服务：

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

启动服务：

```bash
docker-compose up -d redis
```

## 性能提升

集成 Redis 缓存后的预期效果：

1. **响应时间**
   - API 响应时间减少 50-90%
   - 缓存命中时响应时间 < 10ms

2. **数据库负载**
   - 减少 60-80% 的数据库查询
   - 降低数据库连接池压力

3. **并发能力**
   - 提升 3-5倍并发处理能力
   - 更好的应对流量高峰

## 注意事项

1. **缓存一致性**
   - 写操作后及时清除相关缓存
   - 使用合理的 TTL 避免数据陈旧

2. **内存管理**
   - 监控 Redis 内存使用
   - 设置合理的最大内存限制
   - 配置淘汰策略（LRU）

3. **错误处理**
   - Redis 连接失败不应影响服务启动
   - 缓存操作失败应降级到直接查询

4. **开发调试**
   - 可通过环境变量禁用缓存
   - 使用 Redis CLI 查看缓存内容

## 未来优化

1. **缓存预热**
   - 应用启动时预加载常用数据

2. **分布式缓存**
   - 多实例共享缓存
   - 使用 Redis Cluster

3. **缓存穿透保护**
   - Bloom Filter
   - 空值缓存

4. **缓存雪崩防护**
   - 缓存过期时间加随机值
   - 热点数据永不过期

5. **监控告警**
   - 缓存命中率监控
   - Redis 性能指标
   - 异常告警机制
