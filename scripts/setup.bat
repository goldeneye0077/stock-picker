@echo off
chcp 65001 >nul
echo Setting up Stock Picker Application...

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js first.
    exit /b 1
)

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed. Please install Python first.
    exit /b 1
)

:: Navigate to project root
cd /d "%~dp0.."

:: Install Node.js dependencies
echo Installing Node.js dependencies...
call npm run install:all

:: Install Python dependencies
echo Installing Python dependencies...
call npm run install:python

:: Create data directory
echo Creating data directory...
if not exist "data" mkdir data

:: Copy environment files
echo Setting up environment files...
if not exist "backend\.env" (
    echo PORT=3000> "backend\.env"
    echo NODE_ENV=development>> "backend\.env"
    echo FRONTEND_URL=http://localhost:3001>> "backend\.env"
    echo DATABASE_PATH=../data/stock_picker.db>> "backend\.env"
    echo REDIS_URL=redis://localhost:6379>> "backend\.env"
)
if not exist "data-service\.env" (
    echo PORT=8001> "data-service\.env"
    echo ENV=development>> "data-service\.env"
    echo TUSHARE_TOKEN=your_tushare_token_here>> "data-service\.env"
    echo AUTO_COLLECT_ON_STARTUP=1>> "data-service\.env"
)

echo.
echo Setup completed successfully!
echo.
echo Next steps:
echo 1. Configure your Tushare token in data-service\.env
echo 2. Run 'npm run dev' to start all services
echo 3. Visit http://localhost:3001 for frontend
echo 4. API available at http://localhost:3000
echo 5. Data service at http://localhost:8001
echo.

pause
