# 选股应用 (Stock Picker)

基于成交量和K线走势分析主力资金介入的智能选股系统

## 项目架构

```
stock-picker/
├── frontend/           # React + TypeScript 前端应用
├── backend/           # Node.js + Express API 服务
├── data-service/      # Python 数据处理和机器学习服务
├── shared/           # 共享类型定义和工具
├── docs/             # 项目文档
└── scripts/          # 部署和工具脚本
```

## 核心功能

- 📊 主力资金流向分析
- 📈 K线走势技术指标计算
- 🎯 智能买入点预测
- 📱 实时行情监控
- 🔍 个股筛选和排序

## 技术栈

### 前端
- React 18 + TypeScript
- TradingView Charting Library
- Ant Design
- Vite

### 后端
- Node.js + Express + TypeScript
- SQLite3 + Redis
- WebSocket 实时数据推送

### 数据处理
- Python + FastAPI
- pandas, numpy, TA-Lib
- scikit-learn, XGBoost
- TensorFlow/PyTorch

## 快速开始

### 自动安装（推荐）
```bash
# Windows
scripts\setup.bat

# Linux/macOS
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### 手动安装
```bash
# 安装所有依赖
npm run setup

# 启动开发环境
npm run dev

# 构建生产版本
npm run build
```

### 配置环境变量
1. 注册 [Tushare Pro](https://tushare.pro/) 账号获取token
2. 在 `backend/.env` 和 `data-service/.env` 中配置 TUSHARE_TOKEN

### 服务端口
- 前端：http://localhost:3001
- 后端API：http://localhost:3000
- 数据服务：http://localhost:8001

## 开发状态

🚧 项目正在开发中...