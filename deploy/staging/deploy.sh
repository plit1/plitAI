#!/usr/bin/env bash
# PLIT 서버 배포 스크립트 (EC2 에서 GitHub Actions → SSM 으로 실행)
#   deploy.sh <이미지 태그(git sha)> [--seed]
# 순서: 설정·시크릿 읽기 → 이미지 받기 → DB 마이그레이션 → 컨테이너 교체 → 상태 확인 → 실패 시 직전 버전으로 되돌림
# 로컬 검증: PLIT_LOCAL=1 (AWS 호출 없이 /opt/plit 대신 PLIT_DIR, 로그는 json-file, 포트 PLIT_PORT)
set -euo pipefail

TAG="${1:?사용법: deploy.sh <image-tag> [--seed]}"
SEED="${2:-}"
ENV_NAME="${PLIT_ENV:-staging}"
DIR="${PLIT_DIR:-/opt/plit}"
PORT="${PLIT_PORT:-80}"
CADDY_IMAGE="${CADDY_IMAGE:-public.ecr.aws/docker/library/caddy:2.10-alpine}"
NET=plit
log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

mkdir -p "$DIR"; cd "$DIR"
umask 077

if [[ "${PLIT_LOCAL:-0}" == "1" ]]; then
  : "${API_REPO:?}" "${WEB_REPO:?}" "${ORIGIN_VERIFY_SECRET:?}"
  [[ -f api.env ]] || { echo "로컬 모드: $DIR/api.env 가 필요합니다"; exit 1; }
else
  # 1) 설정 (비밀 아님): SSM Parameter Store /plit/<env>/config
  REGION="$(curl -sf -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' | xargs -I{} curl -sf -H 'X-aws-ec2-metadata-token: {}' http://169.254.169.254/latest/meta-data/placement/region)"
  CFG="$(aws ssm get-parameter --region "$REGION" --name "/plit/$ENV_NAME/config" --query Parameter.Value --output text)"
  j() { jq -r "$1" <<<"$CFG"; }
  API_REPO="$(j .api_repo)"; WEB_REPO="$(j .web_repo)"; REGISTRY="${API_REPO%%/*}"
  # 2) 시크릿: Secrets Manager (앱 시크릿 + RDS 가 관리하는 DB 비밀번호) → 권한 600 env 파일
  APP="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$(j .app_secret_arn)" --query SecretString --output text)"
  DB="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$(j .db_secret_arn)" --query SecretString --output text)"
  ORIGIN_VERIFY_SECRET="$(jq -r .ORIGIN_VERIFY_SECRET <<<"$APP")"
  DB_URL="$(jq -r --arg host "$(j .db_host)" --arg name "$(j .db_name)" \
    '"postgresql://\(.username|@uri):\(.password|@uri)@\($host):5432/\($name)?schema=public&sslmode=require"' <<<"$DB")"
  {
    echo "NODE_ENV=$ENV_NAME"; echo "PORT=4000"; echo "TRUST_PROXY_HOPS=2"
    echo "DATABASE_URL=$DB_URL"
    echo "APP_ORIGIN=$(j .app_origin)"; echo "OAUTH_REDIRECT_BASE=$(j .app_origin)/api/v1/auth/oauth"
    echo "STORAGE_DRIVER=s3"; echo "S3_UPLOAD_BUCKET=$(j .uploads_bucket)"; echo "AWS_REGION=$REGION"
    # 앱 시크릿 JSON 의 키를 그대로 환경변수로 (값이 빈 키는 제외, 헤더 비밀은 API 에 불필요)
    jq -r 'to_entries[] | select(.value != "" and .key != "ORIGIN_VERIFY_SECRET") | "\(.key)=\(.value)"' <<<"$APP"
  } > api.env.new && mv api.env.new api.env
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  LOG_GROUP="$(j .log_group)"
fi

logopts() { # $1 = 스트림 이름. 서버: CloudWatch Logs / 로컬: 파일(10MB 회전)
  if [[ "${PLIT_LOCAL:-0}" == "1" ]]; then echo "--log-driver json-file --log-opt max-size=10m"
  else echo "--log-driver awslogs --log-opt awslogs-region=$REGION --log-opt awslogs-group=$LOG_GROUP --log-opt awslogs-stream=$1"; fi
}

API_IMAGE="$API_REPO:$TAG"; WEB_IMAGE="$WEB_REPO:$TAG"
log "이미지 받기 $TAG"
if [[ "${PLIT_LOCAL:-0}" != "1" ]]; then docker pull -q "$API_IMAGE" >/dev/null; docker pull -q "$WEB_IMAGE" >/dev/null; docker pull -q "$CADDY_IMAGE" >/dev/null; fi
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

log "DB 마이그레이션"
docker run --rm --network "$NET" --env-file api.env "$API_IMAGE" node node_modules/prisma/build/index.js migrate deploy
if [[ "$SEED" == "--seed" ]]; then log "기본 데이터(시드)"; docker run --rm --network "$NET" --env-file api.env "$API_IMAGE" node dist/seed/seed.js; fi

run_stack() { # $1 = 태그
  local api="$API_REPO:$1" web="$WEB_REPO:$1"
  docker rm -f plit-api plit-web plit-caddy >/dev/null 2>&1 || true
  # shellcheck disable=SC2046
  docker run -d --name plit-api --network "$NET" --network-alias api --restart unless-stopped --init \
    --env-file api.env $(logopts api) "$api" >/dev/null
  # shellcheck disable=SC2046
  docker run -d --name plit-web --network "$NET" --network-alias web --restart unless-stopped --init \
    -e HOSTNAME=0.0.0.0 -e API_ORIGIN=http://api:4000 $(logopts web) "$web" >/dev/null
  # shellcheck disable=SC2046
  docker run -d --name plit-caddy --network "$NET" --restart unless-stopped -p "$PORT:80" \
    -e ORIGIN_VERIFY_SECRET="$ORIGIN_VERIFY_SECRET" -v "$DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
    $(logopts caddy) "$CADDY_IMAGE" >/dev/null
}
healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -H "X-Origin-Verify: $ORIGIN_VERIFY_SECRET" "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1 \
      && curl -fsS -o /dev/null -H "X-Origin-Verify: $ORIGIN_VERIFY_SECRET" "http://127.0.0.1:$PORT/"; then return 0; fi
    sleep 3
  done
  return 1
}

PREV="$(cat current_tag 2>/dev/null || true)"
log "컨테이너 교체 (이전: ${PREV:-없음})"
run_stack "$TAG"
if healthy; then
  echo "$TAG" > current_tag
  log "배포 완료: $TAG"
  [[ "${PLIT_LOCAL:-0}" == "1" ]] || docker image prune -af --filter "until=168h" >/dev/null || true
else
  log "상태 확인 실패 — 로그:"; docker logs --tail 40 plit-api 2>&1 || true
  if [[ -n "$PREV" && "$PREV" != "$TAG" ]]; then log "직전 버전 $PREV 로 되돌림"; run_stack "$PREV"; healthy && log "되돌림 완료"; fi
  exit 1
fi
