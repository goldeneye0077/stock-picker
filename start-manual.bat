@echo off
REM ========================================
REM 智能选股系统 - 手动分步启动 (Windows)
REM 在三个独立窗口中启动服务
REM ========================================

echo.
echo ========================================
echo 智能选股系统 - 分步启动
echo ========================================
echo.
echo 此脚本将在三个独立窗口中启动服务
echo 您可以看到每个服务的独立日志
echo.

REM 检查数据目录
if not exist "data\" (
    echo [提示] 创建 data 目录...
    mkdir data
)

echo [1/3] 启动后端服务 (端口 3000)...
start "后端服务 - 端口 3000" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak >nul

echo [2/3] 启动前端服务 (端口 3001)...
start "前端服务 - 端口 3001" cmd /k "cd frontend && npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] 启动数据服务 (端口 8001)...
start "数据服务 - 端口 8001" cmd /k "cd data-service && python -m uvicorn src.main:app --reload --port 8001"

echo.
echo ========================================
echo 所有服务已启动！
echo ========================================
echo.
echo 服务访问地址:
echo   前端界面: http://localhost:3001
echo   后端API:  http://localhost:3000
echo   数据服务: http://localhost:8001
echo   API文档:  http://localhost:8001/docs
echo.
echo 提示: 关闭对应的窗口即可停止该服务
echo.

pause
