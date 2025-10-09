# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个包含两个独立项目的代码库：

1. **stock-picker/** - 智能选股系统（主项目）
2. **根目录** - 1688 电商爬虫工具

## 项目 1: 智能选股系统 (stock-picker/)

### 架构概览

基于成交量和 K 线走势分析主力资金介入的智能选股系统，采用前后端分离的微服务架构。

```
stock-picker/
├── frontend/           # React + TypeScript (端口 3001)
├── backend/           # Node.js + Express (端口 3000)
├── data-service/      # Python + FastAPI (端口 8001)
├── data/             # SQLite 数据库文件目录
└── *.py              # 根目录数据管理脚本
```

### 核心功能
- 主力资金流向分析（FundFlowAnalyzer）
- K 线走势技术指标计算
- 智能买入点预测（BuySignalPredictor）
- 实时行情监控（WebSocket）
- 个股筛选和排序

### 常用开发命令

#### 环境初始化
```bash
cd stock-picker

# 一键安装所有依赖（Node.js + Python）
npm run setup

# 单独安装
npm run install:all     # 仅 Node.js
npm run install:python  # 仅 Python
```

#### 开发模式
```bash
# 并行启动所有服务（推荐）
npm run dev

# 单独启动
npm run dev:frontend        # http://localhost:3001
npm run dev:backend         # http://localhost:3000
npm run dev:data-service    # http://localhost:8001

# 进入子目录开发
cd frontend && npm run dev
cd backend && npm run dev
cd data-service && python -m uvicorn src.main:app --reload --port 8001
```

#### 构建与测试
```bash
npm run build                # 构建所有
npm run build:frontend
npm run build:backend
npm run test                 # 运行所有测试
npm run test:frontend
npm run test:backend
cd data-service && python -m pytest  # 数据服务测试
```

#### 前端特定
```bash
cd frontend
npm run lint      # ESLint 检查
npm run preview   # 预览构建
```

#### Docker 部署
```bash
docker-compose up -d      # 启动容器（含 Redis）
docker-compose down       # 停止容器
```

### 数据管理脚本（关键工具）

```bash
# ⭐ 【推荐】高效批量下载最近 7 天 A 股全量数据
# API 调用次数从 5000+ 降至 15 次，耗时从 50 分钟降至 2 分钟
python download_7days_all_stocks.py

# 清除并重新下载全量数据（逐个下载，耗时长）
python clear_and_download_all_stocks.py

# 数据状态检查
python check_data.py

# 创建示例数据（开发测试用）
python create_sample_data.py

# 增强市场数据
python enhance_market_data.py

# 验证数据完整性
python verify_data.py
```

**重要**：
- 运行前需在 `data-service/.env` 配置 `TUSHARE_TOKEN`（从 https://tushare.pro/ 获取）
- **推荐使用** `download_7days_all_stocks.py`，效率提升 300 倍
- 详细说明见 `批量数据采集使用说明.md`

### 技术栈详情

#### 前端 (frontend/)
- React 18 + TypeScript + Vite
- Ant Design 5 + Pro Components (ProLayout)
- React Router v7
- 默认深色主题（darkAlgorithm）
- 主要页面：`Dashboard.tsx`, `StockList.tsx`, `Analysis.tsx`, `Settings.tsx`
- API 配置：`config/api.ts`

#### 后端 (backend/)
- Node.js + Express + TypeScript
- SQLite3（路径：`data/stock_picker.db`）
- WebSocket（ws://localhost:3000）
- 中间件：Helmet, CORS, Morgan
- 路由：`/api/stocks`, `/api/analysis`, `/health`
- 数据库初始化：`config/database.ts` 中的 `initDatabase()`

#### 数据服务 (data-service/)
- Python 3 + FastAPI + Uvicorn
- Tushare Pro API（数据源）
- aiosqlite（异步 SQLite）
- 核心模块：
  - `analyzers/volume/volume_analyzer.py` - VolumeAnalyzer
  - `analyzers/funds/fund_flow_analyzer.py` - FundFlowAnalyzer
  - `models/predictor.py` - BuySignalPredictor
  - `data_sources/tushare_client.py` - Tushare 客户端
  - `routes/` - API 路由（stocks, analysis, signals, data_collection, quotes）
  - `utils/database.py` - 数据库工具
- 启动：`main.py` 使用 lifespan 上下文管理器

### 数据库表结构
- `stocks` - 股票基本信息（code, name, exchange, industry）
- `klines` - K 线数据（日线行情）
- `volume_analysis` - 成交量分析结果
- `fund_flow` - 资金流向数据
- `buy_signals` - 买入信号记录

### 环境配置

在 `backend/.env` 和 `data-service/.env` 中配置：
```bash
TUSHARE_TOKEN=your_tushare_pro_token  # 必需

# 可选
PORT=3000
FRONTEND_URL=http://localhost:3001
DATABASE_URL=sqlite:./data/stock_picker.db
REDIS_URL=redis://redis:6379  # Docker 部署时
```

### 开发注意事项

1. **数据库路径**：所有服务共享 `data/stock_picker.db`，确保目录存在且有写权限
2. **API 限频**：Tushare API 每分钟 120 次、每天 200 次（免费），脚本已实现 0.6 秒延迟
3. **TypeScript**：前端和后端各有独立 tsconfig.json
4. **CORS**：后端默认允许 http://localhost:3001
5. **WebSocket**：后端集成 WebSocket 用于实时数据推送
6. **日志**：数据服务用 loguru，后端用 morgan
7. **Docker**：含 Redis 服务（端口 6379）

### API 端点参考

#### 后端 (localhost:3000)
- `GET /health` - 健康检查
- `GET /api/stocks` - 股票列表
- `GET /api/analysis` - 分析数据

#### 数据服务 (localhost:8001)
- `GET /` - 服务信息
- `GET /health` - 健康检查
- `GET /api/stocks` - 股票基本信息
- `GET /api/analysis/{stock_code}` - 个股分析
- `GET /api/signals` - 买入信号列表
- `POST /api/data/batch-collect-7days` - ⭐ 批量采集 7 天数据（高效）
- `GET /api/data/status` - 数据采集状态
- `POST /api/data/fetch-stocks` - 获取股票列表
- `POST /api/data/fetch-klines/{stock_code}` - 获取 K 线数据

---

## 项目 2: 1688 电商爬虫工具

### 文件说明

根目录下的 Python 脚本用于 1688 电商平台商品数据采集：

- `1688_scraper_enhanced.py` - 增强版以图搜图商品采集器（主脚本）
- `test_scraper.py` - 爬虫测试脚本
- `save_image.py` - 图片保存工具

### 核心功能

`1688_scraper_enhanced.py` 提供以下功能：

1. **自动化商品搜索**：通过产品图片在 1688 进行以图搜图
2. **反爬虫对抗**：
   - Windows 系统代理自动管理（ProxyManager）
   - 浏览器指纹伪装（Canvas、WebGL 混淆）
   - 人类行为模拟（HumanBehavior）：随机延时、自然滚动、鼠标移动
   - 增强版反检测脚本注入（隐藏 webdriver 属性）
3. **数据提取**：价格、销量、成交金额、库存、供应商信息
4. **智能过滤**：仅保留销量 ≥ 2 或成交金额 > 1 元的商品
5. **Excel 导出**：自动生成 `1688_商品数据_{timestamp}.xlsx`

### 使用方式

```bash
# 运行主脚本
python 1688_scraper_enhanced.py

# 根据提示输入产品图片路径
# 是否开启调试模式？(y/n)
```

**工作流程**：
1. 启动 Chrome 浏览器（使用用户数据目录保持登录状态）
2. 检查 1688 登录状态，未登录则引导手动登录
3. 自动上传图片进行以图搜图
4. 模拟真实用户浏览行为（自然滚动、随机延时）
5. 提取商品数据并按价格排序
6. 导出到 Excel 文件

### 技术架构

#### 核心类

1. **ProxyManager** - Windows 系统代理管理器
   - 自动禁用系统代理（防止干扰）
   - 任务结束后恢复原始代理设置

2. **HumanBehavior** - 人类行为模拟器
   - `random_sleep(min_sec, max_sec)` - 随机延时
   - `simulate_mouse_move(driver)` - 模拟鼠标移动
   - `natural_scroll(driver, scroll_times)` - 自然滚动（随机速度、停顿、偶尔回滚）

3. **Alibaba1688Scraper** - 主爬虫类
   - 初始化参数：`headless`, `use_profile`, `debug`
   - 反检测配置：
     - User-Agent 伪装（Chrome 131.0.0.0）
     - 禁用自动化特征 (`--disable-blink-features=AutomationControlled`)
     - 注入 JavaScript 混淆脚本（Canvas 指纹、WebGL 指纹、navigator 属性伪造）
   - 登录管理：`check_login_status()`, `manual_login()`
   - 搜索功能：`search_by_image(image_path, retry_count=3)`
   - 数据提取：`extract_products(max_results=30)`
   - 商品解析：`_parse_product_item(item, idx)` - 支持多种 CSS 选择器
   - 导出功能：`export_to_excel(products, output_file)`

#### 反反爬核心技术

- **浏览器指纹伪造**：
  ```javascript
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Canvas/WebGL 指纹混淆
  // Date 时间精度修改
  ```
- **行为特征模拟**：
  - 滚动时随机停顿 0.8-2.5 秒
  - 30% 概率向上回滚（模拟查看内容）
  - 页面加载后随机延时 2-3 秒
- **Chrome 配置优化**：
  - 用户数据目录（保持登录）
  - 禁用代理、扩展、自动化标志
  - 最大化窗口（1920x1080）

### 依赖库

```bash
pip install selenium pandas openpyxl
```

需要 Chrome 浏览器和对应版本的 ChromeDriver。

### 调试模式

开启调试模式（`debug=True`）会输出：
- 每个商品的详细解析信息
- CSS 选择器匹配结果
- 过滤原因（销量/成交金额不达标）
- 异常堆栈跟踪
- 调试截图（保存到 `debug_screenshot_{timestamp}.png`）

### 注意事项

1. **Windows 专用**：代理管理功能基于 Windows 注册表（`winreg` 模块）
2. **登录状态**：首次运行需手动登录，后续自动保持
3. **用户数据目录**：存储在 `chrome_profile_1688/`，可删除以重置登录
4. **进程管理**：脚本结束时自动终止 Chrome 进程（通过 `taskkill`）
5. **编码问题**：已处理 Windows 命令行 UTF-8 编码（`sys.stdout.reconfigure`）

### 安全提示

此爬虫仅用于合法的商业数据收集和价格调研，请遵守：
- 1688 平台服务条款
- 《网络安全法》和《数据安全法》
- 合理的访问频率（避免对服务器造成负担）

---

## 通用规范

### 编码规范
- Python：遵循 PEP 8，使用类型注解
- TypeScript：遵循 ESLint 配置，启用严格模式
- 中文注释优先，关键业务逻辑需详细说明

### Git 工作流
- `main` 分支受保护
- 功能开发使用 feature 分支
- 提交信息使用中文，格式：`类型: 简要描述`

### 测试要求
- 后端核心业务逻辑需单元测试
- 数据服务算法需单元测试（pytest）
- 前端组件可选集成测试

### 错误处理
- API 错误统一返回 `{ success: boolean, message: string, data?: any }`
- Python 使用 loguru 记录详细日志
- 前端使用 Ant Design Message 组件提示用户
