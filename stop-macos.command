#!/bin/bash
# KioBridge — 3000/4000 포트에서 이 프로젝트가 띄운 프로세스만 종료합니다.
set -e
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
cd "$SCRIPT_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node tools/stop-dev.mjs
