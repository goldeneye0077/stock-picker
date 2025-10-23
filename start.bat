@echo off
REM ========================================
REM 智能选股系统 - Windows 快速启动脚本
REM ========================================

echo.
echo ========================================
echo 智能选股系统 - 服务启动
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查 Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo [信息] 正在启动服务...
echo.

REM 使用 Node.js 启动脚本
node start-services.js

pause
