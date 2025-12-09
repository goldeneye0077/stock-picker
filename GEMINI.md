# GEMINI.md - 智能选股系统 (Stock Picker)

> **最后更新**: 2025年11月24日
> **系统语言**: 中文
> **项目状态**: 开发中 (Beta)

## 1. 项目概览
**智能选股系统 (Stock Picker)** 是一个基于主力资金流向、K线形态分析和技术指标的自动化选股平台。旨在帮助用户发现潜在的买入机会。

*   **核心目标**: 通过数据分析识别主力资金动向。
*   **首选语言**: 中文 (Mandarin Chinese)。
*   **数据源**: Tushare Pro API。

## 2. 系统架构 (Architecture)

本项目采用类似于 Monorepo 的结构，包含三个主要服务：

### 2.1 前端应用 (`/frontend`)
*   **类型**: Web SPA
*   **技术栈**: React 18 (Vite), TypeScript, Ant Design 5 (UI), ECharts (图表).
*   **端口**: `3001`
*   **功能**: 数据可视化 dashboard, K线图展示, 选股结果筛选.
*   **测试**: Vitest

### 2.2 后端 API (`/backend`)
*   **类型**: RESTful API + WebSocket
*   **技术栈**: Node.js, Express, TypeScript.
*   **数据库**: SQLite3 (主库), Redis (缓存).
*   **端口**: `3000`
*   **功能**: 业务逻辑处理, 用户请求转发, 实时数据推送 (WebSocket).
*   **Swagger**: 目前因类型配置问题暂时禁用。

### 2.3 数据服务 (`/data-service`)
*   **类型**: 计算与数据采集服务
*   **技术栈**: Python 3, FastAPI, Pandas, NumPy, APScheduler.
*   **端口**: `8001` (或 `8002`，取决于配置，代码中默认 `8002` 但文档常指 `8001`)。
*   **功能**: Tushare 数据采集, 量化指标计算 (资金流向, 量价分析), 定时任务.
*   **文档**: `http://localhost:8002/docs`

## 3. 关键文件与目录

*   **根目录**:
    *   `start.bat` / `start.sh`: 智能一键启动脚本 (推荐)。
    *   `data/stock_picker.db`: SQLite 数据库文件 (核心数据存储)。
    *   `scripts/`: 环境安装与维护脚本。
    *   `docker-compose.yml`: 容器化部署配置。
    *   `*.py`: 根目录下包含大量独立的数据分析脚本 (如 `analyze_hot_stocks.py`, `download_30days.py`)，用于手动跑批或调试。
*   **Backend (`backend/src`)**:
    *   `config/database.ts`: 数据库连接配置。
    *   `routes/`: 路由定义。
*   **Frontend (`frontend/src`)**:
    *   `components/`: 通用组件。
    *   `pages/`: 页面视图。
*   **Data Service (`data-service/src`)**:
    *   `analyzers/`: 核心金融分析算法 (资金流, 量价)。
    *   `scheduler.py`: 定时任务调度。

## 4. 快速开始 (Quick Start)

### 4.1 环境准备
确保已安装 Node.js (v18+) 和 Python (3.10+)。

### 4.2 安装依赖
```bash
# Windows
.\scripts\setup.bat

# Linux/macOS
chmod +x scripts/setup.sh
./scripts/setup.sh

# 手动全量安装
npm run setup
```

### 4.3 启动应用 (开发模式)
推荐使用智能启动脚本，它会自动检查环境和端口：

*   **Windows**: 双击 `start.bat` 或运行 `npm run dev`
*   **Linux/Mac**: 运行 `./start.sh`

访问地址：
*   前端: `http://localhost:3001`
*   后端 API: `http://localhost:3000`
*   数据 API: `http://localhost:8002` (或 8001)

### 4.4 环境变量配置 (.env)
*   **backend/.env**: 需要配置 `PORT`, `DATABASE_URL` (默认指向 `../data/stock_picker.db`), `REDIS_URL`。
*   **data-service/.env**: **必须**配置 `TUSHARE_TOKEN` 才能获取数据。

## 5. 开发规范 (Conventions)

1.  **语言**: 所有的用户交互、日志输出、文档说明必须使用**中文**。代码注释推荐使用中文。
2.  **类型安全**: 前后端必须严格遵守 TypeScript 类型定义。Python 代码应使用 Type Hints。
3.  **数据一致性**: 所有的写操作应考虑 SQLite 的锁机制，避免长时间占用。
4.  **提交规范**: Git commit message 应清晰描述变更内容 (推荐 Conventional Commits)。

## 6. 常用维护命令

*   **数据补录**: `python download_30days.py` (根目录)
*   **全量分析**: `python analyze_all_stocks.py`
*   **前端测试**: `cd frontend && npm test`
*   **后端测试**: `cd backend && npm test`

## 7. 记忆与偏好 (User Memories)
*   用户偏好使用中文交流。
*   用户是一位优秀的全栈开发者 (Vue/React, Python/Node.js, DevOps)。
*   Chrome 调试端口: 9222 (启动命令: `Start-Process ... --remote-debugging-port=9222`).