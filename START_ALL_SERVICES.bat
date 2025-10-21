@echo off
REM 智能选股系统 - Windows 启动脚本
REM 使用方法: 双击运行此文件

echo ======================================
echo   智能选股系统 - 服务启动脚本
echo ======================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js 未安装，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查 Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Python 未安装，请先安装 Python3
    pause
    exit /b 1
)

echo ✅ 依赖检查通过
echo.

REM 创建必要目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs

REM 配置环境变量
if not exist "backend\.env" (
    copy backend\.env.example backend\.env
    echo ✅ 后端 .env 文件已创建
)

if not exist "data-service\.env" (
    echo # Tushare API Token (可选) > data-service\.env
    echo # TUSHARE_TOKEN=your_token_here >> data-service\.env
    echo. >> data-service\.env
    echo # 数据库路径 >> data-service\.env
    echo DATABASE_PATH=../data/stock_picker.db >> data-service\.env
    echo ✅ 数据服务 .env 文件已创建
)

echo.
echo ======================================
echo   安装项目依赖
echo ======================================

REM 安装依赖
if not exist "node_modules" (
    echo 安装根目录依赖...
    call npm install
)

if not exist "backend\node_modules" (
    echo 安装后端依赖...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules" (
    echo 安装前端依赖...
    cd frontend
    call npm install
    cd ..
)

echo 安装数据服务依赖...
pip3 install -r data-service\requirements.txt --quiet

echo.
echo ======================================
echo   启动所有服务
echo ======================================

REM 启动后端
echo 启动后端服务 (端口 3000)...
start "Stock Picker - Backend" cmd /c "cd backend && npm run dev > ..\logs\backend.log 2>&1"
timeout /t 2 /nobreak >nul

REM 启动数据服务
echo 启动数据服务 (端口 8001)...
start "Stock Picker - Data Service" cmd /c "cd data-service && python -m uvicorn src.main:app --reload --port 8001 --host 0.0.0.0 > ..\logs\data-service.log 2>&1"
timeout /t 3 /nobreak >nul

REM 启动前端
echo 启动前端服务 (端口 3001)...
start "Stock Picker - Frontend" cmd /c "cd frontend && npm run dev > ..\logs\frontend.log 2>&1"
timeout /t 3 /nobreak >nul

echo.
echo ======================================
echo   ✅ 所有服务启动成功！
echo ======================================
echo.
echo 📌 服务访问地址：
echo    前端界面:  http://localhost:3001
echo    后端API:   http://localhost:3000
echo    数据服务:  http://localhost:8001
echo    API文档:   http://localhost:8001/docs
echo.
echo 📝 日志文件：
echo    后端日志:     logs\backend.log
echo    数据服务日志: logs\data-service.log
echo    前端日志:     logs\frontend.log
echo.
echo 💡 提示：
echo    - 关闭各个服务窗口即可停止服务
echo    - 数据库位置: data\stock_picker.db
echo    - 如需下载数据: python create_sample_data.py
echo.
echo 按任意键打开前端页面...
pause >nul
start http://localhost:3001
