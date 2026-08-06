@echo off
REM ============================================================
REM  KioBridge Simulation Kit - Windows stop script
REM  Stops ONLY the dev processes this project recorded (by PID).
REM  It never kills unrelated processes found by port scanning.
REM ============================================================
setlocal
chcp 65001 >nul 2>&1
cd /d "%~dp0"

if not exist "package.json" (
  echo [오류] package.json 을 찾을 수 없습니다: %CD%
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js 를 찾을 수 없습니다.
  pause
  exit /b 1
)

call node "tools\stop-dev.mjs"
if errorlevel 1 (
  echo [오류] 종료 처리 중 문제가 발생했습니다.
  pause
  endlocal
  exit /b 1
)

endlocal
exit /b 0
