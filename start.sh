#!/usr/bin/env bash
# ============================================================
#  start.sh - macOS/Linux 원 클릭 실행기
#  서버를 띄우고 기본 브라우저를 자동으로 엽니다.
#  사용: ./start.sh   종료: Ctrl-C
# ============================================================
set -e
cd "$(dirname "$0")"
echo "Starting shot.monster (one-click)..."
node launch.js "$@"
