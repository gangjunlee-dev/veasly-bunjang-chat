@echo off
echo.
echo =============================================
echo   Bunjang Chat Monitor - Windows Install
echo =============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo Please install Python 3.10+ from https://python.org
    echo IMPORTANT: Check "Add Python to PATH" during install!
    pause
    exit /b 1
)

echo [1/3] Installing Python packages...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Installing Playwright browsers...
python -m playwright install chromium
if errorlevel 1 (
    echo [ERROR] Playwright install failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Installation complete!
echo.
echo =============================================
echo   HOW TO USE:
echo   1. Double-click start.bat
echo   2. Log in to Bunjang in the browser window
echo   3. Monitor will start automatically
echo =============================================
echo.
pause
