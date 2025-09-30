# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

智能选股系统 - 基于成交量和K线走势分析主力资金介入，采用前后端分离的微服务架构。

### 核心功能
- 主力资金流向分析
- K线走势技术指标计算
- 智能买入点预测
- 实时行情监控
- 个股筛选和排序

## 项目结构

```
stock-picker/
├── frontend/           # React + TypeScript 前端 (端口 3001)
├── backend/           # Node.js + Express API (端口 3000)
├── data-service/      # Python + FastAPI 数据服务 (端口 8001)
├── data/             # SQLite 数据库文件目录
├── *.py              # 根目录数据管理脚本
└── docker-compose.yml # Docker 编排配置
```

## 常用开发命令

### 环境初始化
```bash
# 一键安装所有依赖（Node.js + Python）
npm run setup

# 单独安装
npm run install:all     # 仅 Node.js 依赖
npm run install:python  # 仅 Python 依赖
```

### 开发模式
```bash
# 并行启动所有服务（推荐）
npm run dev

# 单独启动服务
npm run dev:frontend        # 前端 http://localhost:3001
npm run dev:backend         # 后端 http://localhost:3000
npm run dev:data-service    # 数据服务 http://localhost:8001

# 进入子目录单独开发
cd frontend && npm run dev
cd backend && npm run dev
cd data-service && python -m uvicorn src.main:app --reload --port 8001
```

### 构建与测试
```bash
# 构建所有服务
npm run build

# 单独构建
npm run build:frontend
npm run build:backend

# 运行测试
npm run test                # 运行所有测试
npm run test:frontend       # 前端测试
npm run test:backend        # 后端测试
npm run test:data-service   # 数据服务测试（cd data-service && python -m pytest）
```

### 前端特定命令
```bash
cd frontend
npm run lint      # ESLint 代码检查
npm run preview   # 预览生产构建
```

### Docker 部署
```bash
docker-compose up -d      # 启动所有容器（含 Redis）
docker-compose down       # 停止所有容器
```

## 数据管理工具脚本

项目根目录提供了多个 Python 脚本用于数据管理：

```bash
# ⭐ 【推荐】高效批量下载最近 7 天 A 股全量数据
# API 调用次数从 5000+ 降至 15 次，耗时从 50 分钟降至 2 分钟
python download_7days_all_stocks.py

# 清除并重新下载 A 股全量数据（逐个股票下载，耗时较长）
python clear_and_download_all_stocks.py

# 检查数据库数据状态
python check_data.py

# 创建示例数据（用于开发测试）
python create_sample_data.py

# 增强市场数据
python enhance_market_data.py

# 验证数据完整性
python verify_data.py
```

**重要**:
- 运行数据脚本前需在 `data-service/.env` 文件中配置 `TUSHARE_TOKEN`（从 https://tushare.pro/ 获取）
- **推荐使用** `download_7days_all_stocks.py` 进行批量数据采集，效率提升 300 倍
- 详细使用说明见 `批量数据采集使用说明.md`

## 核心架构设计

### 前端架构 (frontend/)
- **技术栈**: React 18 + TypeScript + Vite
- **UI 框架**: Ant Design 5 + Pro Components (ProLayout)
- **路由**: React Router v7
- **主题**: 默认深色主题（darkAlgorithm）
- **页面结构**:
  - `Dashboard.tsx`: 仪表盘
  - `StockList.tsx`: 股票列表
  - `Analysis.tsx`: 资金分析
  - `Settings.tsx`: 系统设置
- **API 配置**: `config/api.ts` 定义后端服务地址

### 后端架构 (backend/)
- **技术栈**: Node.js + Express + TypeScript
- **数据库**: SQLite3 (路径: `data/stock_picker.db`)
- **实时通信**: WebSocket (ws://localhost:3000)
- **中间件**: Helmet (安全), CORS, Morgan (日志)
- **路由**:
  - `/api/stocks`: 股票数据接口
  - `/api/analysis`: 分析数据接口
  - `/health`: 健康检查
- **数据库初始化**: `config/database.ts` 中的 `initDatabase()` 函数

### 数据服务架构 (data-service/)
- **技术栈**: Python 3 + FastAPI + Uvicorn
- **数据源**: Tushare Pro API
- **数据库**: aiosqlite (异步 SQLite)
- **模块化设计**:
  - `analyzers/volume/`: 成交量分析器 (VolumeAnalyzer)
  - `analyzers/funds/`: 资金流向分析器 (FundFlowAnalyzer)
  - `models/`: 买入信号预测器 (BuySignalPredictor)
  - `data_sources/`: Tushare 客户端封装
  - `routes/`: API 路由
    - `/api/stocks`: 股票基本信息
    - `/api/analysis`: 技术分析
    - `/api/signals`: 买入信号
    - `/api/data`: 数据采集任务
  - `utils/database.py`: 数据库工具函数
- **启动流程**: `main.py` 使用 lifespan 上下文管理器初始化数据库和分析器

### 数据库表结构
- `stocks`: 股票基本信息（code, name, exchange, industry）
- `klines`: K线数据（日线行情）
- `volume_analysis`: 成交量分析结果
- `fund_flow`: 资金流向数据
- `buy_signals`: 买入信号记录

## 环境配置

### 必需环境变量
在 `backend/.env` 和 `data-service/.env` 中配置：
```
TUSHARE_TOKEN=your_tushare_pro_token
```

### 可选环境变量
- `PORT`: 后端服务端口（默认 3000）
- `FRONTEND_URL`: 前端地址（默认 http://localhost:3001）
- `DATABASE_URL`: 数据库路径（默认 sqlite:./data/stock_picker.db）
- `REDIS_URL`: Redis 地址（Docker 部署时使用，默认 redis://redis:6379）

## 开发注意事项

1. **数据库路径**: 所有服务共享 `data/stock_picker.db`，确保该目录存在且有写权限
2. **API 限频**: Tushare API 每分钟 120 次调用，脚本已实现 0.6 秒延迟
3. **TypeScript 配置**: 前端和后端各有独立的 tsconfig.json
4. **CORS 配置**: 后端默认允许 http://localhost:3001 跨域访问
5. **WebSocket**: 后端集成 WebSocket 服务器用于实时数据推送
6. **日志**: 数据服务使用 loguru 记录日志，后端使用 morgan
7. **Docker**: docker-compose 配置包含 Redis 服务（用于缓存，端口 6379）

## API 端点示例

### 后端 API (http://localhost:3000)
- `GET /health`: 健康检查
- `GET /api/stocks`: 获取股票列表
- `GET /api/analysis`: 获取分析数据

### 数据服务 API (http://localhost:8001)
- `GET /`: 服务信息
- `GET /health`: 健康检查
- `GET /api/stocks`: 股票基本信息
- `GET /api/analysis/{stock_code}`: 个股分析
- `GET /api/signals`: 买入信号列表
- `POST /api/data/batch-collect-7days`: ⭐ 批量采集最近 7 天数据（高效）
- `GET /api/data/status`: 查询数据采集状态
- `POST /api/data/fetch-stocks`: 获取股票列表
- `POST /api/data/fetch-klines/{stock_code}`: 获取单只股票 K 线数据