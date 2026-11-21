@echo off
rem ALBAGO test server (Windows). Requires Node.js 22.13 or newer.
rem Usage: scripts\start-test-server.bat          (same Wi-Fi)
rem        scripts\start-test-server.bat tunnel   (outside network / HTTPS, needs cloudflared)
setlocal
cd /d "%~dp0.."
if "%PORT%"=="" set "PORT=8080"
where node >nul 2>nul || (echo Node.js is not installed. Install 22 LTS or newer from https://nodejs.org & exit /b 1)
for /f %%v in ('node -e "const [a,b]=process.versions.node.split('.').map(Number);console.log(a>22||(a===22&&b>=13)?1:0)"') do set NODE_OK=%%v
if not "%NODE_OK%"=="1" (echo Node.js 22.13 or newer is required. & exit /b 1)
set "ALBAGO_DEV=1"
set "ALBAGO_DATA=%cd%\data-test"
echo.
echo   ALBAGO test server (dev mode: verification codes are printed here)
echo   This PC      : http://localhost:%PORT%
echo   Same Wi-Fi   : http://(this PC's IP, see ipconfig):%PORT%
echo   Owner        : sign up at /signup, then /owner
echo.
if /i "%1"=="tunnel" (
  where cloudflared >nul 2>nul || (echo cloudflared is not installed: winget install Cloudflare.cloudflared & exit /b 1)
  set "ALBAGO_TRUST_PROXY=1"
  start "ALBAGO server" /min node --no-warnings server.js
  echo   An https://....trycloudflare.com address will appear below. Use it on phones and in the app.
  cloudflared tunnel --url http://localhost:%PORT%
) else (
  node --no-warnings server.js
)
endlocal
