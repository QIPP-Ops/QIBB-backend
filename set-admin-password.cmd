@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo.
  echo Create .env in this folder first. Example:
  echo   MONGODB_URI=mongodb+srv://your-connection-from-azure
  echo.
  echo Copy MONGODB_URI from Azure Portal - qipp-api - Environment variables
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-admin-password.ps1"
pause
