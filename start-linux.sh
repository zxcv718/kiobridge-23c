#!/usr/bin/env bash
# KioBridge Simulation Platform — Linux 시작 스크립트
# 어느 위치에서 실행하든 이 스크립트가 있는 프로젝트 루트로 이동합니다.
set -euo pipefail

# 스크립트 자신의 디렉터리 = 프로젝트 루트 (공백/한글 경로 안전)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SCRIPT_DIR"

MIN_NODE_MAJOR=20

echo "================================================"
echo " KioBridge 공식 시뮬레이터"
echo "================================================"
echo " 프로젝트 경로: $SCRIPT_DIR"
echo

# 1. package.json 확인
if [ ! -f "package.json" ]; then
  echo "[오류] package.json 을 찾을 수 없습니다: $SCRIPT_DIR"
  echo "       이 스크립트를 프로젝트 폴더 안에 둔 채로 실행하세요."
  exit 1
fi

# 2~3. Node 확인
if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js 가 설치되어 있지 않습니다."
  echo "       https://nodejs.org 에서 Node.js 22 LTS 를 설치하세요."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
  echo "[오류] Node.js $MIN_NODE_MAJOR 이상이 필요합니다. 현재: $(node --version)"
  echo "       권장: Node.js 22 LTS"
  exit 1
fi
echo " Node.js: $(node --version)"

# 4. npm 확인
if ! command -v npm >/dev/null 2>&1; then
  echo "[오류] npm 을 찾을 수 없습니다."
  exit 1
fi
echo " npm    : $(npm --version)"
echo

# 5. 의존성 설치
if [ ! -d "node_modules" ]; then
  echo " 의존성을 설치합니다 (npm ci) — 처음 한 번만 걸립니다..."
  npm ci
  echo
fi

# 6~7. 실행
echo "------------------------------------------------"
echo " Web: http://localhost:3000"
echo " API: http://localhost:4000"
echo
echo " 종료하려면 Ctrl+C 를 누르세요."
echo "------------------------------------------------"
echo

node tools/dev-with-healthcheck.mjs
