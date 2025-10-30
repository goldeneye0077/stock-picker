@echo off
REM ========================================
REM 智能选股系统 - Windows 服务重启脚本
REM ========================================

echo.
echo ========================================
echo 智能选股系统 - 服务重启
echo ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

echo [信息] 正在重启所有服务...
echo.

REM 使用 Node.js 重启脚本
node restart-services.js

pause
