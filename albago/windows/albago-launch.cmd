@echo off
rem ALBAGO launcher: opens the given URL as an app window in Chrome or Edge (default browser if neither).
rem Usage: albago-launch.cmd <url> [full|max]
setlocal
set "URL=%~1"
set "MODE=%~2"
set "PROFILE=%LocalAppData%\ALBAGO\profile"
set "BROWSER="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)
if not defined BROWSER (
  start "" "%URL%"
  goto :eof
)
if /i "%MODE%"=="full" (
  start "" "%BROWSER%" --app=%URL% "--user-data-dir=%PROFILE%" --no-first-run --no-default-browser-check --start-fullscreen
) else (
  start "" "%BROWSER%" --app=%URL% "--user-data-dir=%PROFILE%" --no-first-run --no-default-browser-check --start-maximized
)
endlocal
