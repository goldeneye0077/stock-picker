@echo off
REM ========================================
REM 智能选股系统 - Windows 服务停止脚本
REM ========================================

echo.
echo ========================================
echo 智能选股系统 - 服务停止
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js
    pause
    exit /b 1
)

echo [信息] 正在停止所有服务...
echo.

REM 使用 Node.js 停止脚本
node stop-services.js

pause
