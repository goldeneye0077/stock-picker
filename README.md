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
