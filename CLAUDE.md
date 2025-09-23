# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目架构

这是一个基于成交量和K线走势分析主力资金介入的智能选股系统，采用微服务架构：

- **frontend/**: React 18 + TypeScript + Ant Design 前端应用，使用 Vite 构建
- **backend/**: Node.js + Express + TypeScript API 服务，提供 RESTful API 和 WebSocket
- **data-service/**: Python + FastAPI 数据处理和机器学习服务，负责股票数据分析
- **shared/**: 共享类型定义和工具库

## 常用开发命令

### 环境搭建
```bash
# 安装所有依赖（包括 Python 依赖）
npm run setup

# 仅安装 Node.js 依赖
npm run install:all

# 仅安装 Python 依赖
npm run install:python
```

### 开发环境
```bash
# 启动所有服务（并行）
npm run dev

# 分别启动各服务
npm run dev:frontend    # 前端 http://localhost:3001
npm run dev:backend     # 后端 API http://localhost:3000
npm run dev:data-service # 数据服务 http://localhost:8001
```

### 构建和测试
```bash
# 构建所有服务
npm run build

# 分别构建
npm run build:frontend
npm run build:backend

# 运行测试
npm run test

# 分别测试
npm run test:frontend
npm run test:backend
npm run test:data-service
```

### 前端开发
```bash
cd frontend
npm run dev      # 开发服务器
npm run build    # 构建生产版本
npm run lint     # ESLint 检查
npm run preview  # 预览构建结果
```

### 后端开发
```bash
cd backend
npm run dev      # nodemon 开发模式
npm run build    # TypeScript 编译
npm run start    # 生产模式启动
```

### 数据服务开发
```bash
cd data-service
python -m uvicorn src.main:app --reload --port 8001  # 开发模式
python -m pytest  # 运行测试
```

## 核心技术栈

### 前端技术栈
- React 18 + TypeScript
- Ant Design + Pro Components (UI 组件库)
- Vite (构建工具)
- React Router (路由)

### 后端技术栈
- Node.js + Express + TypeScript
- SQLite3 (数据库)
- WebSocket (实时数据推送)
- Morgan (日志), Helmet (安全), CORS

### 数据服务技术栈
- Python + FastAPI
- pandas, numpy (数据处理)
- aiosqlite (异步数据库)
- Tushare (股票数据源)

## 数据服务架构

数据服务按功能模块化组织：
- `analyzers/`: 分析器模块（资金流向、成交量分析等）
- `data_sources/`: 数据源（Tushare 客户端等）
- `models/`: 机器学习预测模型
- `routes/`: API 路由
- `utils/`: 工具函数

## 环境配置

需要在 `backend/.env` 和 `data-service/.env` 中配置：
- `TUSHARE_TOKEN`: Tushare Pro API Token

## 服务端口

- 前端：http://localhost:3001
- 后端 API：http://localhost:3000
- 数据服务：http://localhost:8001