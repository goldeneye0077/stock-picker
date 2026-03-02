# Stock Picker

多服务股票分析系统，包含 `frontend`、`backend`、`data-service` 三个核心服务。

## 目录结构

```text
stock-picker/
  backend/                  # Node.js API
  frontend/                 # React 前端
  data-service/             # FastAPI 数据服务
  specs/                    # OpenAPI 与契约测试
  scripts/
    data/                   # 数据采集/生成脚本
    diagnostics/            # 检查、分析、排障脚本
    dev/                    # 本地启动/停止/重启脚本
    migrate/                # 数据修复与迁移脚本
    ops/                    # 运维脚本与结构校验
  tests/manual/             # 手工测试资产（API/前端页面）
  docs/
    architecture/           # 架构文档
    guides/                 # 使用与开发指南
    reports/                # 阶段总结与报告
  artifacts/                # 临时产物、日志、样例输出
```

## 常用命令

```bash
npm run setup
npm run dev
npm run build
npm run test
npm run repo:check-structure
```

## 启动入口（兼容保留）

根目录以下脚本为兼容入口，真实实现已迁移到 `scripts/dev/`：

- `start-services.js`
- `stop-services.js`
- `restart-services.js`
- `start.bat` / `start.sh`
- `stop.bat` / `restart.bat` / `start-manual.bat`

## 结构治理

提交前会执行根目录结构检查，避免再次出现脚本/文档/临时文件散落在仓库根目录的情况。

- 检查脚本：`scripts/ops/check-root-structure.js`
- npm 命令：`npm run repo:check-structure`

## DB Evolution / AI Insights / Realtime Bus (2026-02)

This repo now supports a staged migration path for high-volume time-series workloads:

- TimescaleDB schema: `scripts/migrate/timescaledb_schema.sql`
- SQLite -> Timescale migration: `scripts/migrate/migrate_sqlite_to_timescale.py`
- Data-service incremental Timescale sync: `data-service/src/utils/timescale_bridge.py`
- Backend dashboard hotspot queries run on TimescaleDB only (`turnover`, `yieldCurve`, market overview).
- Docker Compose includes one-shot schema bootstrap service: `timescaledb-init` (runs `timescaledb_schema.sql` before backend/data-service start).
- Manual rerun of schema bootstrap: `docker compose up -d --force-recreate timescaledb-init`

New AI market insight pipeline:

- Insight engine: `data-service/src/services/market_insight_engine.py`
- API routes: `GET /api/market-insights/latest`, `POST /api/market-insights/generate`
- Stored in PostgreSQL table: `market_insights`
- Daily scheduler generates post-close market insights automatically.

Realtime event bus:

- Data-service publishes events to Redis channel `MARKET_EVENT_CHANNEL` (default `market:events`)
- Backend subscribes Redis and broadcasts over WebSocket
- Frontend Home consumes websocket events and refreshes dashboard data without full-page reload

Recommended environment variables:

- `TIMESCALE_ENABLED=true`
- `TIMESCALE_URL=postgresql://postgres:postgres@timescaledb:5432/stock_picker`
- `MARKET_EVENT_CHANNEL=market:events`
- `REDIS_PUBSUB_ENABLED=true`
- `VITE_WS_URL=ws://localhost:3100` (optional; auto-derived by default)
