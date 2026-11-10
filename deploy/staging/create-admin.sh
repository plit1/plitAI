#!/usr/bin/env bash
# 최초 최고관리자 만들기 — 서버(EC2) Session Manager 화면에서 직접 실행
#   sudo /opt/plit/create-admin.sh 관리자이메일@회사도메인 [닉네임]
# 임시 비밀번호는 이 화면에만 한 번 표시된다 (SSM Run Command 로 실행하지 말 것 — 출력이 AWS 에 저장됨)
set -euo pipefail
EMAIL="${1:?사용법: sudo /opt/plit/create-admin.sh 관리자이메일 [닉네임]}"
NICK="${2:-플릿관리자}"
cd /opt/plit
IMAGE="$(docker inspect plit-api --format '{{.Config.Image}}')"
docker run --rm -it --network plit --env-file /opt/plit/api.env "$IMAGE" node dist/cli/create-admin.js --email "$EMAIL" --nickname "$NICK"
