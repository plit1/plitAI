#!/usr/bin/env bash
# 브라우저 E2E 실행기: 흐름마다 새 DB(plit_e2e_<시각>_<흐름>)를 만들어 기존 데이터를 건드리지 않는다.
#  - API 는 NODE_ENV=staging 으로 띄워 운영 기본값(관리자 MFA 강제)으로 검증
#  - 생성된 DB 는 자동 삭제하지 않음. 정리: psql -c 'DROP DATABASE <이름>'
#  - 사용: apps/web/e2e/run.sh [core-flow phase3-flow ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PG="${PG_ADMIN_URL:-postgresql://plit:plit@localhost:5432/postgres}"
LOG="${E2E_LOG_DIR:-/tmp}"
if [ $# -gt 0 ]; then FLOWS=("$@"); else FLOWS=(core-flow phase3-flow phase4-flow phase5-flow phase6-flow); fi
STAMP="$(date +%Y%m%d%H%M%S)"
(cd "$ROOT/apps/api" && npx nest build >/dev/null)
# 서버는 표준 입출력을 모두 파일로 돌려 완전히 분리 (파이프를 붙잡아 실행기가 끝나지 않는 문제 방지)
if ! curl -sf localhost:3000/ >/dev/null; then (cd "$ROOT/apps/web" && exec npx next start -p 3000) > "$LOG/plit-e2e-web.log" 2>&1 < /dev/null & sleep 5; fi
STATUS=0
for FLOW in "${FLOWS[@]}"; do
  DB="plit_e2e_${STAMP}_${FLOW//-/_}"
  URL="postgresql://plit:plit@localhost:5432/${DB}"
  psql "$PG" -qc "CREATE DATABASE ${DB}"
  (cd "$ROOT/apps/api" && DATABASE_URL="$URL?schema=public" npx prisma migrate deploy >/dev/null && DATABASE_URL="$URL?schema=public" node dist/seed/seed.js >/dev/null)
  pkill -f "node dist/main.js" || true; sleep 1
  (cd "$ROOT/apps/api" && DATABASE_URL="$URL?schema=public" NODE_ENV=staging exec node dist/main.js) > "$LOG/plit-e2e-api-${FLOW}.log" 2>&1 < /dev/null &
  for i in $(seq 1 30); do curl -sf localhost:4000/api/v1/health >/dev/null && break; sleep 1; done
  echo "=== ${FLOW} (DB ${DB})"
  (cd "$ROOT/apps/web" && PGURL="$URL" node "e2e/${FLOW}.mjs") || STATUS=1
done
pkill -f "node dist/main.js" || true # 실행기가 띄운 API 정리
exit $STATUS
