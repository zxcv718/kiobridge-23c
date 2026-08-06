#!/usr/bin/env bash
# KioBridge — 3000/4000 포트에서 이 프로젝트가 띄운 프로세스만 종료합니다.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SCRIPT_DIR"
node tools/stop-dev.mjs
