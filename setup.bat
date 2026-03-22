@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║       Apartment ERP — Setup Script       ║
echo   ║             Windows Version              ║
echo   ╚══════════════════════════════════════════╝
echo.

:: ── Check Docker ────────────────────────────────────────────────
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found.
    echo.
    echo Please install Docker Desktop from:
    echo   https://www.docker.com/products/docker-desktop/
    echo.
    echo After installing, restart your computer and run this script again.
    pause
    exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose not found.
    echo Please make sure Docker Desktop is updated to the latest version.
    pause
    exit /b 1
)

for /f "tokens=3" %%v in ('docker --version') do (
    echo Docker %%v found. OK
    goto :docker_ok
)
:docker_ok

:: ── Create .env from template ────────────────────────────────────
if not exist ".env" (
    echo.
    echo Generating .env with random secrets...
    copy .env.example .env >nul

    :: Generate random hex values using PowerShell
    for /f %%i in ('powershell -NoProfile -Command "[System.Guid]::NewGuid().ToString('N') + [System.Guid]::NewGuid().ToString('N')"') do set DB_PASS=%%i
    for /f %%i in ('powershell -NoProfile -Command "[System.Guid]::NewGuid().ToString('N') + [System.Guid]::NewGuid().ToString('N')"') do set REDIS_PASS=%%i
    for /f %%i in ('powershell -NoProfile -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set NEXTAUTH_SECRET=%%i
    for /f %%i in ('powershell -NoProfile -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set ONLYOFFICE_SECRET=%%i
    for /f %%i in ('powershell -NoProfile -Command "[System.Guid]::NewGuid().ToString('N')"') do set CRON_SECRET=%%i

    :: Write final .env using PowerShell (handles special chars safely)
    powershell -NoProfile -Command ^
        "$content = Get-Content '.env' -Raw;" ^
        "$content = $content -replace 'CHANGE_THIS_DB_PASSWORD', '%DB_PASS%';" ^
        "$content = $content -replace 'CHANGE_THIS_REDIS_PASSWORD', '%REDIS_PASS%';" ^
        "$content = $content -replace 'CHANGE_THIS_NEXTAUTH_SECRET', '%NEXTAUTH_SECRET%';" ^
        "$content = $content -replace 'CHANGE_THIS_ONLYOFFICE_SECRET', '%ONLYOFFICE_SECRET%';" ^
        "$content = $content -replace 'CHANGE_THIS_CRON_SECRET', '%CRON_SECRET%';" ^
        "Set-Content '.env' $content -NoNewline;"

    echo Secrets generated. OK
) else (
    echo .env already exists — using existing configuration.
)

:: ── Ask for server address ────────────────────────────────────────
echo.
echo ┌─────────────────────────────────────────────────────────────┐
echo │  Server Address                                             │
echo │                                                             │
echo │  • Press ENTER for 'localhost' (this machine only)         │
echo │  • Type your VPS/server IP for remote access               │
echo │    Example: 103.21.45.67                                    │
echo └─────────────────────────────────────────────────────────────┘
echo.

for /f "tokens=2 delims==" %%v in ('findstr /b "APP_HOST=" .env') do set CURRENT_HOST=%%v
set /p NEW_HOST="APP_HOST [%CURRENT_HOST%]: "

if not "!NEW_HOST!"=="" (
    if not "!NEW_HOST!"=="%CURRENT_HOST%" (
        powershell -NoProfile -Command ^
            "$content = Get-Content '.env' -Raw;" ^
            "$content = $content -replace '^APP_HOST=.*', 'APP_HOST=!NEW_HOST!' -options Multiline;" ^
            "Set-Content '.env' $content -NoNewline;"
        echo APP_HOST set to: !NEW_HOST!
    )
)

:: ── Build and start ───────────────────────────────────────────────
echo.
echo Building and starting all services...
echo (First build takes 5-15 minutes — downloading images and compiling)
echo.

docker compose up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] Docker Compose failed. Check the error above.
    echo.
    echo Common fixes:
    echo   1. Make sure Docker Desktop is running
    echo   2. Run: docker compose logs
    pause
    exit /b 1
)

:: ── Wait for app to be ready ──────────────────────────────────────
echo.
echo Waiting for services to start...

for /f "tokens=2 delims==" %%v in ('findstr /b "APP_HOST=" .env') do set APP_HOST=%%v
for /f "tokens=2 delims==" %%v in ('findstr /b "APP_PORT=" .env') do set APP_PORT=%%v
if "!APP_PORT!"=="" set APP_PORT=3001

set HEALTH_URL=http://!APP_HOST!:!APP_PORT!/api/health
set /a MAX=36
set /a COUNT=0

:wait_loop
timeout /t 5 /nobreak >nul
set /a COUNT+=1
curl -sf "!HEALTH_URL!" >nul 2>&1
if not errorlevel 1 goto :ready
if !COUNT! LSS !MAX! (
    set /a PCT=COUNT*100/MAX
    echo   Waiting... (!PCT!%%)
    goto :wait_loop
)
echo.
echo [WARNING] App did not respond in time.
echo Check logs with:  docker compose logs app
goto :show_info

:ready
echo   App is ready!

:show_info
:: ── Read final values ──────────────────────────────────────────────
for /f "tokens=2 delims==" %%v in ('findstr /b "APP_HOST=" .env') do set FINAL_HOST=%%v
for /f "tokens=2 delims==" %%v in ('findstr /b "APP_PORT=" .env') do set FINAL_PORT=%%v
for /f "tokens=2 delims==" %%v in ('findstr /b "ONLYOFFICE_PORT=" .env') do set OO_PORT=%%v
if "!FINAL_PORT!"=="" set FINAL_PORT=3001
if "!OO_PORT!"=="" set OO_PORT=8080

echo.
echo   ╔══════════════════════════════════════════════════════╗
echo   ║                  Setup Complete!                     ║
echo   ╠══════════════════════════════════════════════════════╣
echo   ║  ERP System:   http://!FINAL_HOST!:!FINAL_PORT!
echo   ║  OnlyOffice:   http://!FINAL_HOST!:!OO_PORT!
echo   ╠══════════════════════════════════════════════════════╣
echo   ║  Admin login:  owner  /  Owner@12345                 ║
echo   ║  Staff login:  staff  /  Staff@12345                 ║
echo   ╠══════════════════════════════════════════════════════╣
echo   ║  !! CHANGE DEFAULT PASSWORDS AFTER FIRST LOGIN !!    ║
echo   ╚══════════════════════════════════════════════════════╝
echo.
echo Useful commands (run in this folder):
echo   docker compose logs -f app    ^<-- View app logs
echo   docker compose down           ^<-- Stop everything
echo   docker compose up -d          ^<-- Start again
echo.
pause
