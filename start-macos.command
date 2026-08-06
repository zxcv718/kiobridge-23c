#!/bin/bash
# KioBridge Simulation Platform — macOS 시작 스크립트 (더블클릭 실행)
# 어느 위치에서 실행하든 이 스크립트가 있는 프로젝트 루트로 이동합니다.
set -e

# 스크립트 자신의 디렉터리 = 프로젝트 루트 (공백/한글/괄호 경로 안전)
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$SCRIPT_DIR"

MIN_NODE_MAJOR=20

echo "================================================"
echo " KioBridge 공식 시뮬레이터"
echo "================================================"
echo " 프로젝트 경로: $SCRIPT_DIR"
echo

if [ ! -f "package.json" ]; then
  echo "[오류] package.json 을 찾을 수 없습니다: $SCRIPT_DIR"
  echo "       이 스크립트를 프로젝트 폴더 안에 둔 채로 실행하세요."
  echo
  read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
  exit 1
fi

# Homebrew / nvm 경로 보강 (Finder 더블클릭 시 PATH 가 짧을 수 있음)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js 가 설치되어 있지 않습니다."
  echo "       https://nodejs.org 에서 Node.js 22 LTS 를 설치하세요."
  echo
  read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  echo "[오류] Node.js $MIN_NODE_MAJOR 이상이 필요합니다. 현재: $(node --version)"
  echo "       권장: Node.js 22 LTS"
  echo
  read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
  exit 1
fi
echo " Node.js: $(node --version)"

if ! command -v npm >/dev/null 2>&1; then
  echo "[오류] npm 을 찾을 수 없습니다."
  echo
  read -r -p "Enter 키를 누르면 창이 닫힙니다..." _
  exit 1
fi
echo " npm    : $(npm --version)"
echo

if [ ! -d "node_modules" ]; then
  echo " 의존성을 설치합니다 (npm ci) — 처음 한 번만 걸립니다..."
  npm ci
  echo
fi

echo "------------------------------------------------"
echo " Web: http://localhost:3000"
echo " API: http://localhost:4000"
echo
echo " 종료하려면 Ctrl+C 를 누르세요."
echo "------------------------------------------------"
echo

node tools/dev-with-healthcheck.mjs
