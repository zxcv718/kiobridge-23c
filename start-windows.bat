@echo off
REM ============================================================
REM  KioBridge Simulation Kit - Windows start script
REM  Runs from this script's own folder, whatever the current dir is.
REM  Paths with spaces, Korean characters or parentheses are safe.
REM ============================================================
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "MIN_NODE_MAJOR=20"

echo ================================================
echo  KioBridge 공식 시뮬레이터 v5.1.4
echo ================================================
echo  프로젝트 경로: %CD%
echo.

if not exist "package.json" (
  echo [오류] package.json 을 찾을 수 없습니다: %CD%
  echo        이 스크립트를 프로젝트 폴더 안에 둔 채로 실행하세요.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js 가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 Node.js 22 LTS 를 설치하세요.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split(String.fromCharCode(46))[0]"') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR (
  echo [오류] Node.js 버전을 확인할 수 없습니다.
  pause
  exit /b 1
)
if !NODE_MAJOR! LSS %MIN_NODE_MAJOR% (
  echo [오류] Node.js %MIN_NODE_MAJOR% 이상이 필요합니다. 현재: !NODE_MAJOR!
  echo        권장: Node.js 22 LTS
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo  Node.js: %%v

where npm >nul 2>&1
if errorlevel 1 (
  echo [오류] npm 을 찾을 수 없습니다. Node.js 를 다시 설치하세요.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('npm --version') do echo  npm    : %%v
echo.

if not exist "node_modules" (
  echo  의존성을 설치합니다 ^(npm ci^) - 처음 한 번만 걸립니다...
  call npm ci
  if errorlevel 1 (
    echo [오류] npm ci 실패. 네트워크 연결을 확인하세요.
    pause
    exit /b 1
  )
  echo.
)

echo ------------------------------------------------
echo  Web: http://localhost:3000
echo  API: http://localhost:4000
echo.
echo  종료하려면 Ctrl+C 를 누르거나 stop-windows.bat 을 실행하세요.
echo ------------------------------------------------
echo.

call node "tools\dev-with-healthcheck.mjs"
if errorlevel 1 (
  echo.
  echo [오류] 개발 서버가 비정상 종료했습니다.
  pause
  endlocal
  exit /b 1
)

endlocal
exit /b 0
