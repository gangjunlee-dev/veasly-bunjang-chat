@echo off
cd /d "%~dp0"
echo =============================================
echo   Bunjang Chat Monitor v2.3 - Auto Login
echo =============================================
echo.
python monitor.py %*
echo.
echo =============================================
echo   Monitor has stopped.
echo   Check session_data\monitor.log for details.
echo =============================================
pause
