@echo off
echo Starting Data Service (Fixed)...
set PYTHONPATH=%~dp0
cd /d %~dp0
echo Current Dir: %CD%
echo PYTHONPATH: %PYTHONPATH%

if "%PORT%"=="" set PORT=8002
python -m uvicorn src.main:app --host 0.0.0.0 --port %PORT% --reload --log-level info
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Service crashed with code %errorlevel%
    echo Possible causes:
    echo 1. Missing dependencies
    echo 2. Import errors
    echo 3. Port 8002 already in use
    pause
)
