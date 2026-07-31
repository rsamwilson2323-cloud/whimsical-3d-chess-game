@echo off
title Omma Project Launcher
color 0A

cd /d "%~dp0"

echo ============================================
echo        Starting Project...
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Node.js is not installed.
    echo Download it from: https://nodejs.org/
    pause
    exit /b
)

:: Install dependencies
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install

    if errorlevel 1 (
        echo.
        echo Failed to install dependencies.
        pause
        exit /b
    )
)

echo.
echo Launching development server...
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173"

:: Start dev server
call npm run dev

pause