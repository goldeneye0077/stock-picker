@echo off
REM ========================================
REM 智能选股系统 - 简化启动脚本 (Windows)
REM 直接使用 concurrently 启动所有服务
REM ========================================

echo.
echo ========================================
echo 智能选股系统 - 简化启动
echo ========================================
echo.

REM 检查根目录的 node_modules
if not exist "node_modules\" (
    echo [提示] 正在安装根目录依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 根目录依赖安装失败
        pause
        exit /b 1
    )
)

REM 检查后端依赖
if not exist "backend\node_modules\" (
    echo [提示] 正在安装后端依赖...
    cd backend
    call npm install
    if errorlevel 1 (
        echo [错误] 后端依赖安装失败
        pause
        exit /b 1
    )
    cd ..
)

REM 检查前端依赖
if not exist "frontend\node_modules\" (
    echo [提示] 正在安装前端依赖...
    cd frontend
    call npm install
    if errorlevel 1 (
        echo [错误] 前端依赖安装失败
        pause
        exit /b 1
    )
    cd ..
)

echo.
echo [信息] 正在启动所有服务...
echo.
echo 服务访问地址:
echo   前端: http://localhost:3001
echo   后端: http://localhost:3000
echo   数据: http://localhost:8001
echo.
echo 按 Ctrl+C 停止所有服务
echo.

REM 使用 npm run dev 启动
call npm run dev

pause
